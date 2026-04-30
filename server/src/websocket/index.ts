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
    // Join a stream room (validate stream exists and is live)
    socket.on("stream:join", async (streamId: string) => {
      if (!streamId || typeof streamId !== "string") return;
      try {
        const stream = await prisma.stream.findUnique({ where: { id: streamId } });
        if (!stream || stream.status !== "live") {
          socket.emit("chat:error", { message: "Stream not available" });
          return;
        }
        const alreadyJoined = socket.rooms.has(`stream:${streamId}`);
        socket.join(`stream:${streamId}`);
        (socket as any).streamId = streamId;

        // Broadcast updated viewer count
        const count = await getLiveViewerCount(streamId);
        io.to(`stream:${streamId}`).emit("viewer:count", {
          streamId,
          count,
        });

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
      socket.leave(`stream:${streamId}`);
      // Broadcast updated viewer count
      try {
        const count = await getLiveViewerCount(streamId);
        io.to(`stream:${streamId}`).emit("viewer:count", {
          streamId,
          count,
        });
      } catch {}
    });

    // Chat message
    socket.on("chat:send", async (data: { streamId: string; text: string }) => {
      if (!socket.user) return;
      if (!data.streamId || typeof data.streamId !== "string") return;
      await handleChatMessage(io, socket as AuthenticatedSocket, data.streamId, data.text);
    });

    // Break/spot bidding + seller controls (uses ack pattern)
    registerBreakHandlers(io, socket);

    // Disconnect cleanup
    socket.on("disconnect", () => {
      // Nothing special needed — Socket.IO auto-removes from rooms
    });
  });

  return io;
}
