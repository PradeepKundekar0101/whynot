import { v4 as uuidv4 } from "uuid";
import prisma from "../lib/prisma";
import redis from "../lib/redis";
import { roomService, createPublisherToken, createViewerToken } from "../lib/livekit";

const LIVE_STREAMS_CACHE_KEY = "streams:live";
const LIVE_STREAMS_CACHE_TTL = 5;

export async function createStream(sellerId: string, title: string, category: string) {
  const livekitRoomName = `stream-${uuidv4()}`;

  try {
    await roomService.createRoom({ name: livekitRoomName });
  } catch (err) {
    console.warn("LiveKit room creation failed (may not be configured):", err);
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

export async function joinStream(streamId: string, userId: string, displayName: string) {
  const stream = await prisma.stream.findUniqueOrThrow({
    where: { id: streamId },
  });

  if (stream.status !== "live") {
    throw new Error("STREAM_NOT_LIVE");
  }

  const token = await createViewerToken(stream.livekitRoomName, userId, displayName);

  const viewerCount = await redis.incr(`stream:${streamId}:viewers`);

  // Sync to Postgres periodically
  if (viewerCount % 5 === 0) {
    await prisma.stream.update({
      where: { id: streamId },
      data: { viewerCount },
    }).catch(() => {});
  }

  return { token, livekitRoomName: stream.livekitRoomName, viewerCount };
}

export async function leaveStream(streamId: string) {
  const viewerCount = await redis.decr(`stream:${streamId}:viewers`);
  if (viewerCount < 0) {
    await redis.set(`stream:${streamId}:viewers`, 0);
  }
}

export async function endStream(streamId: string, sellerId: string) {
  const stream = await prisma.stream.update({
    where: { id: streamId, sellerId },
    data: { status: "ended", endedAt: new Date() },
  });

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
        const liveCount = await redis.get(`stream:${s.id}:viewers`);
        return { ...s, viewerCount: liveCount ? parseInt(liveCount) : s.viewerCount };
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
