import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { verifyAccessToken } from "../lib/jwt";
import { handleChatMessage } from "./chat";
import { JwtPayload } from "../types";

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
    // Join a stream room
    socket.on("stream:join", async (streamId: string) => {
      socket.join(`stream:${streamId}`);
      // Store which stream this socket is in
      (socket as any).streamId = streamId;
    });

    // Leave a stream room
    socket.on("stream:leave", (streamId: string) => {
      socket.leave(`stream:${streamId}`);
    });

    // Chat message
    socket.on("chat:send", async (data: { streamId: string; text: string }) => {
      if (!socket.user) return;
      await handleChatMessage(io, socket as AuthenticatedSocket, data.streamId, data.text);
    });

    // Disconnect cleanup
    socket.on("disconnect", () => {
      // Nothing special needed — Socket.IO auto-removes from rooms
    });
  });

  return io;
}
