import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { verifyAccessToken } from "../lib/jwt";
import { handleChatMessage } from "./chat";
import { registerBreakHandlers } from "./break";
import { setIO } from "./emitter";
import { JwtPayload } from "../types";
import prisma from "../lib/prisma";
import { REDIS_URL } from "../lib/redis";
import logger from "../lib/logger";
import { emitSystemEvent } from "../services/chat-events.service";
import { getLiveViewerCount } from "../services/stream.service";
import { getAllowedClientOrigins } from "../lib/client-origins";

export interface AuthenticatedSocket extends Socket {
  user?: JwtPayload;
}

interface ViewerInfo {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isSeller: boolean;
}

/**
 * Walk every socket currently connected to a stream room and gather a deduped
 * viewer list (seller flagged separately). Used to power the Watching tab.
 *
 * Lives in-process — sufficient for single-instance deployments. With horizontal
 * scaling we'd need a Redis-backed presence set instead.
 */
async function fetchViewerList(io: Server, streamId: string): Promise<ViewerInfo[]> {
  let sockets: Awaited<ReturnType<typeof io.in>["fetchSockets"]> extends infer T ? T : never;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sockets = (await io.in(`stream:${streamId}`).fetchSockets()) as any;
  } catch {
    return [];
  }

  const userIds = new Set<string>();
  for (const s of sockets as unknown as Array<{ data?: unknown; user?: JwtPayload }>) {
    // fetchSockets returns RemoteSocket — `socket.user` is preserved through
    // the auth middleware via `data` mirroring; but in this codebase we set it
    // directly on the socket instance which the remote-socket proxy also exposes.
    const u = (s as unknown as { user?: JwtPayload }).user;
    if (u?.userId) userIds.add(u.userId);
  }

  if (userIds.size === 0) return [];

  const stream = await prisma.stream
    .findUnique({ where: { id: streamId }, select: { sellerId: true } })
    .catch(() => null);

  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(userIds) } },
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  });

  return users.map((u) => ({
    ...u,
    isSeller: stream?.sellerId === u.id,
  }));
}

async function broadcastViewerList(io: Server, streamId: string) {
  try {
    const viewers = await fetchViewerList(io, streamId);
    io.to(`stream:${streamId}`).emit("viewer:list", { streamId, viewers });
  } catch {
    // best-effort
  }
}

/**
 * After this socket leaves a stream room, decide whether the user's last
 * socket has departed. If so, emit a `user_left` system event so it shows up
 * in the chat feed. (Throttled in chat-events service to collapse bursts.)
 */
async function maybeEmitUserLeft(
  io: Server,
  streamId: string,
  userId: string
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sockets = (await io.in(`stream:${streamId}`).fetchSockets()) as any;
    const stillPresent = (sockets as Array<{ user?: JwtPayload }>).some(
      (s) => s.user?.userId === userId
    );
    if (stillPresent) return;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    if (!user) return;
    void emitSystemEvent(streamId, {
      eventType: "user_left",
      userId,
      username: user.username,
    });
  } catch {
    // best-effort
  }
}

export async function setupWebSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: getAllowedClientOrigins(),
      credentials: true,
    },
  });

  setIO(io);

  // Redis adapter for horizontal scaling (after connectRedis() in bootstrap)
  try {
    const pubClient = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
    const subClient = pubClient.duplicate({ lazyConnect: true });
    pubClient.on("error", (err) => logger.warn(err, "Redis pub client error"));
    subClient.on("error", (err) => logger.warn(err, "Redis sub client error"));
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
  } catch (err) {
    logger.warn(err, "Redis adapter not available, using in-memory adapter");
  }

  // JWT authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }
    try {
      const payload = verifyAccessToken(token);
      socket.user = payload;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    // Join a stream room (allows scheduled and live; the page enforces what's
    // allowed to happen in each state).
    socket.on("stream:join", async (streamId: string) => {
      if (!streamId || typeof streamId !== "string") return;
      try {
        const stream = await prisma.stream.findUnique({ where: { id: streamId } });
        if (!stream) {
          socket.emit("chat:error", { message: "Stream not available" });
          return;
        }
        if (stream.status === "ended" || stream.status === "cancelled") {
          socket.emit("chat:error", { message: "Stream not available" });
          return;
        }
        const alreadyJoined = socket.rooms.has(`stream:${streamId}`);
        socket.join(`stream:${streamId}`);
        (socket as any).streamId = streamId;

        // Broadcast updated viewer count + presence list
        const count = await getLiveViewerCount(streamId);
        io.to(`stream:${streamId}`).emit("viewer:count", {
          streamId,
          count,
        });
        void broadcastViewerList(io, streamId);

        // Fire a system "joined" event the first time this socket joins the room.
        // Throttled to collapse mass joins into "N viewers joined".
        if (!alreadyJoined && socket.user && stream.sellerId !== socket.user.userId) {
          try {
            const user = await prisma.user.findUnique({
              where: { id: socket.user.userId },
              select: { username: true },
            });
            if (user) {
              void emitSystemEvent(streamId, {
                eventType: "user_joined",
                userId: socket.user.userId,
                username: user.username,
              });
            }
          } catch {
            // best-effort — don't block the join
          }
        }
      } catch {
        // Stream lookup failed — still allow join for resilience
        socket.join(`stream:${streamId}`);
      }
    });

    // Leave a stream room
    socket.on("stream:leave", async (streamId: string) => {
      const userId = socket.user?.userId;
      socket.leave(`stream:${streamId}`);
      // Broadcast updated viewer count
      try {
        const count = await getLiveViewerCount(streamId);
        io.to(`stream:${streamId}`).emit("viewer:count", {
          streamId,
          count,
        });
        void broadcastViewerList(io, streamId);
      } catch {}

      // Emit "user_left" only if this user has no remaining sockets in the room.
      if (userId) {
        const stream = await prisma.stream
          .findUnique({ where: { id: streamId }, select: { sellerId: true } })
          .catch(() => null);
        if (stream && stream.sellerId !== userId) {
          await maybeEmitUserLeft(io, streamId, userId);
        }
      }
    });

    // Chat message
    socket.on("chat:send", async (data: { streamId: string; text: string }) => {
      if (!socket.user) return;
      if (!data.streamId || typeof data.streamId !== "string") return;
      await handleChatMessage(io, socket as AuthenticatedSocket, data.streamId, data.text);
    });

    // Manual presence refresh request (used after reconnects)
    socket.on("viewer:list:request", async (streamId: string) => {
      if (!streamId || typeof streamId !== "string") return;
      try {
        const viewers = await fetchViewerList(io, streamId);
        socket.emit("viewer:list", { streamId, viewers });
      } catch {}
    });

    // Break/spot bidding + seller controls (uses ack pattern)
    registerBreakHandlers(io, socket);

    // Disconnect cleanup — Socket.IO auto-removes from rooms, but we still
    // need to refresh the presence list and possibly emit user_left.
    socket.on("disconnecting", async () => {
      const userId = socket.user?.userId;
      const rooms = Array.from(socket.rooms).filter((r) => r.startsWith("stream:"));
      // Defer the post-disconnect work so room membership has updated by then.
      setImmediate(() => {
        for (const room of rooms) {
          const streamId = room.slice("stream:".length);
          void (async () => {
            try {
              const count = await getLiveViewerCount(streamId);
              io.to(room).emit("viewer:count", { streamId, count });
              void broadcastViewerList(io, streamId);
              if (userId) {
                const stream = await prisma.stream
                  .findUnique({ where: { id: streamId }, select: { sellerId: true } })
                  .catch(() => null);
                if (stream && stream.sellerId !== userId) {
                  await maybeEmitUserLeft(io, streamId, userId);
                }
              }
            } catch {}
          })();
        }
      });
    });
  });

  return io;
}
