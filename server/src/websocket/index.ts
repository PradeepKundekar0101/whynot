import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { verifyAccessToken } from "../lib/jwt";
import { handleChatMessage } from "./chat";
import { JwtPayload } from "../types";
import prisma from "../lib/prisma";
import redis from "../lib/redis";

export interface AuthenticatedSocket extends Socket {
  user?: JwtPayload;
}

export function setupWebSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      credentials: true,
    },
  });

  // Redis adapter for horizontal scaling
  try {
    const pubClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
    const subClient = pubClient.duplicate();
    pubClient.on("error", (err) => console.warn("Redis pub client error:", err.message));
    subClient.on("error", (err) => console.warn("Redis sub client error:", err.message));
    io.adapter(createAdapter(pubClient, subClient));
  } catch (err) {
    console.warn("Redis adapter not available, using in-memory adapter:", err);
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
        socket.join(`stream:${streamId}`);
        (socket as any).streamId = streamId;

        // Broadcast updated viewer count
        const count = await redis.get(`stream:${streamId}:viewers`);
        io.to(`stream:${streamId}`).emit("viewer:count", {
          streamId,
          count: count ? parseInt(count) : stream.viewerCount,
        });
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
        const count = await redis.get(`stream:${streamId}:viewers`);
        if (count) {
          io.to(`stream:${streamId}`).emit("viewer:count", {
            streamId,
            count: parseInt(count),
          });
        }
      } catch {}
    });

    // Chat message
    socket.on("chat:send", async (data: { streamId: string; text: string }) => {
      if (!socket.user) return;
      if (!data.streamId || typeof data.streamId !== "string") return;
      await handleChatMessage(io, socket as AuthenticatedSocket, data.streamId, data.text);
    });

    // Disconnect cleanup
    socket.on("disconnect", () => {
      // Nothing special needed — Socket.IO auto-removes from rooms
    });
  });

  return io;
}
