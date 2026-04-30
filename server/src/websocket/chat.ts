import { Server } from "socket.io";
import { RateLimiterRedis } from "rate-limiter-flexible";
import Redis from "ioredis";
import prisma from "../lib/prisma";
import { AuthenticatedSocket } from "./index";

// Rate limiter: 5 messages per 10 seconds per user
let chatLimiter: RateLimiterRedis | null = null;

try {
  const redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
  redisClient.on("error", (err) => console.warn("Chat rate limiter Redis error:", err.message));
  chatLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: "ratelimit:chat",
    points: 5,
    duration: 10,
  });
} catch {
  console.warn("Chat rate limiter not available (Redis not connected)");
}

export async function handleChatMessage(
  io: Server,
  socket: AuthenticatedSocket,
  streamId: string,
  text: string
) {
  if (!socket.user) return;

  // Validate text
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 500) return;

  // Rate limiting
  if (chatLimiter) {
    try {
      await chatLimiter.consume(socket.user.userId);
    } catch {
      socket.emit("chat:error", { message: "Too many messages. Slow down!" });
      return;
    }
  }

  // Persist to database
  try {
    const message = await prisma.chatMessage.create({
      data: {
        streamId,
        userId: socket.user.userId,
        text: trimmed,
      },
    });

    // Fetch user info for the broadcast
    const user = await prisma.user.findUnique({
      where: { id: socket.user.userId },
      select: { username: true, displayName: true, avatarUrl: true },
    });

    // Broadcast to everyone in the stream room
    io.to(`stream:${streamId}`).emit("chat:message", {
      id: message.id,
      streamId,
      userId: socket.user.userId,
      username: user?.username || "unknown",
      displayName: user?.displayName || "Unknown",
      avatarUrl: user?.avatarUrl,
      text: trimmed,
      createdAt: message.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("Chat message error:", err);
    socket.emit("chat:error", { message: "Failed to send message" });
  }
}
