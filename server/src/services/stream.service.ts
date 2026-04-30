import { v4 as uuidv4 } from "uuid";
import prisma from "../lib/prisma";
import redis from "../lib/redis";
import { roomService, createPublisherToken, createViewerToken } from "../lib/livekit";
import logger from "../lib/logger";
import { emitToStream } from "../websocket/emitter";

const LIVE_STREAMS_CACHE_KEY = "streams:live";
const LIVE_STREAMS_CACHE_TTL = 5;

/** Redis set of unique viewer session tokens (one per browser tab / client mount). */
export function viewerSessionsKey(streamId: string) {
  return `stream:${streamId}:viewer_sessions`;
}

/** Authoritative live viewer count from presence set (excludes seller sessions). */
export async function getLiveViewerCount(streamId: string): Promise<number> {
  try {
    return await redis.scard(viewerSessionsKey(streamId));
  } catch {
    return 0;
  }
}

function broadcastViewerCount(streamId: string, count: number) {
  emitToStream(streamId, "viewer:count", { streamId, count });
}

async function syncViewerCountToDb(streamId: string, viewerCount: number) {
  if (viewerCount !== 0 && viewerCount % 5 !== 0) return;
  await prisma.stream
    .update({
      where: { id: streamId },
      data: { viewerCount },
    })
    .catch(() => {});
}

export async function createStream(sellerId: string, title: string, category: string) {
  const livekitRoomName = `stream-${uuidv4()}`;

  try {
    await roomService.createRoom({ name: livekitRoomName });
  } catch (err) {
    logger.warn(err, "LiveKit room creation failed (may not be configured)");
  }

  const stream = await prisma.stream.create({
    data: {
      sellerId,
      title,
      category,
      status: "live",
      livekitRoomName,
      startedAt: new Date(),
    },
    include: { seller: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  });

  const token = await createPublisherToken(livekitRoomName, sellerId, stream.seller.displayName);

  await redis.del(LIVE_STREAMS_CACHE_KEY).catch(() => {});

  return { stream, token };
}

export async function joinStream(
  streamId: string,
  userId: string,
  displayName: string,
  viewerSessionId: string
) {
  const stream = await prisma.stream.findUniqueOrThrow({
    where: { id: streamId },
  });

  if (stream.status !== "live") {
    throw new Error("STREAM_NOT_LIVE");
  }

  const token = await createViewerToken(stream.livekitRoomName, userId, displayName);

  const sessionsKey = viewerSessionsKey(streamId);
  let viewerCount: number;

  if (stream.sellerId === userId) {
    // Seller may open the buyer page while live; they're not counted as a viewer.
    viewerCount = await getLiveViewerCount(streamId);
  } else if (!viewerSessionId || viewerSessionId.length < 8) {
    throw new Error("INVALID_VIEWER_SESSION");
  } else {
    await redis.sadd(sessionsKey, viewerSessionId);
    await redis.expire(sessionsKey, 72 * 3600);
    viewerCount = await redis.scard(sessionsKey);

    await redis.del(`stream:${streamId}:viewers`).catch(() => {});

    await syncViewerCountToDb(streamId, viewerCount);
    broadcastViewerCount(streamId, viewerCount);
  }

  return { token, livekitRoomName: stream.livekitRoomName, viewerCount };
}

export async function leaveStream(streamId: string, viewerSessionId?: string | null) {
  if (!viewerSessionId || viewerSessionId.length < 8) {
    broadcastViewerCount(streamId, await getLiveViewerCount(streamId));
    return;
  }

  await redis.srem(viewerSessionsKey(streamId), viewerSessionId);

  await redis.del(`stream:${streamId}:viewers`).catch(() => {});

  const viewerCount = await getLiveViewerCount(streamId);
  broadcastViewerCount(streamId, viewerCount);
  await syncViewerCountToDb(streamId, viewerCount);
}

export async function endStream(streamId: string, sellerId: string) {
  const stream = await prisma.stream.update({
    where: { id: streamId, sellerId },
    data: { status: "ended", endedAt: new Date() },
  });

  await redis.del(`stream:${streamId}:viewer_sessions`).catch(() => {});
  await redis.del(`stream:${streamId}:viewers`).catch(() => {});
  await redis.del(LIVE_STREAMS_CACHE_KEY).catch(() => {});

  try {
    await roomService.deleteRoom(stream.livekitRoomName);
  } catch {
    // Room may already be gone
  }

  return stream;
}

export async function getLiveStreams(category?: string) {
  if (!category) {
    try {
      const cached = await redis.get(LIVE_STREAMS_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch {}
  }

  const where: any = { status: "live" };
  if (category) where.category = category;

  const streams = await prisma.stream.findMany({
    where,
    orderBy: { viewerCount: "desc" },
    include: {
      seller: { select: { username: true, displayName: true, avatarUrl: true } },
    },
  });

  // Enrich with live viewer counts from Redis
  const enriched = await Promise.all(
    streams.map(async (s) => {
      try {
        const liveCount = await getLiveViewerCount(s.id);
        return { ...s, viewerCount: liveCount };
      } catch {
        return s;
      }
    })
  );

  if (!category) {
    await redis.setex(LIVE_STREAMS_CACHE_KEY, LIVE_STREAMS_CACHE_TTL, JSON.stringify(enriched)).catch(() => {});
  }

  return enriched;
}

export async function getStreamById(streamId: string) {
  return prisma.stream.findUniqueOrThrow({
    where: { id: streamId },
    include: {
      seller: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });
}

/**
 * Find the caller's currently-live stream (if any) and mint a fresh publisher token for it.
 * Used by the seller dashboard to resume a stream after a page reload without re-creating it.
 */
export async function resumeOwnStream(sellerId: string) {
  const stream = await prisma.stream.findFirst({
    where: { sellerId, status: "live" },
    orderBy: { startedAt: "desc" },
    include: { seller: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  });

  if (!stream) return null;

  const token = await createPublisherToken(stream.livekitRoomName, sellerId, stream.seller.displayName);
  return { stream, token };
}

/**
 * Mint a fresh publisher token for a specific stream the caller owns.
 * Used by the broadcaster page so a hard reload of /seller/stream/:id can rejoin.
 */
export async function getBroadcasterToken(streamId: string, sellerId: string) {
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    include: { seller: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  });

  if (!stream) throw new Error("STREAM_NOT_FOUND");
  if (stream.sellerId !== sellerId) throw new Error("NOT_AUTHORIZED");
  if (stream.status !== "live") throw new Error("STREAM_NOT_LIVE");

  const token = await createPublisherToken(stream.livekitRoomName, sellerId, stream.seller.displayName);
  return { stream, token };
}
