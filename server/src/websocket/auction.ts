import { Server } from "socket.io";
import { RateLimiterRedis } from "rate-limiter-flexible";
import Redis from "ioredis";
import { placeBid } from "../services/listing.service";
import { AuthenticatedSocket } from "./index";

let bidLimiter: RateLimiterRedis | null = null;

try {
  const redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
  redisClient.on("error", (err) => console.warn("Bid rate limiter Redis error:", err.message));
  bidLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: "ratelimit:bid",
    points: 10,
    duration: 1,
  });
} catch {
  console.warn("Bid rate limiter not available");
}

export async function handleBidPlace(
  io: Server,
  socket: AuthenticatedSocket,
  data: { listingId: string; amount: number }
) {
  if (!socket.user) return;

  if (!data.listingId || typeof data.amount !== "number" || data.amount <= 0) {
    socket.emit("bid:error", { message: "Invalid bid data" });
    return;
  }

  // Rate limit
  if (bidLimiter) {
    try {
      await bidLimiter.consume(socket.user.userId);
    } catch {
      socket.emit("bid:error", { message: "Too many bids. Slow down!" });
      return;
    }
  }

  try {
    const result = await placeBid(data.listingId, socket.user.userId, data.amount);

    // Get the streamId from the listing to broadcast to the right room
    const streamId = result.listing.streamId;

    // Broadcast bid to everyone in the stream
    io.to(`stream:${streamId}`).emit("listing:bid", {
      listingId: data.listingId,
      bidderId: socket.user.userId,
      bidderUsername: result.bidder.username,
      bidderDisplayName: result.bidder.displayName,
      amount: data.amount,
      currentBid: result.listing.currentBid,
      highBidderId: result.listing.highBidderId,
    });

    // If extended due to anti-snipe
    if (result.extended) {
      io.to(`stream:${streamId}`).emit("listing:extended", {
        listingId: data.listingId,
        endsAt: result.listing.endsAt?.toISOString(),
      });
    }
  } catch (err: any) {
    const errorMessages: Record<string, string> = {
      INSUFFICIENT_FUNDS: "Insufficient wallet balance",
      BID_TOO_LOW: "Bid is too low",
      LISTING_NOT_AVAILABLE: "Listing is not available",
      AUCTION_ENDED: "Auction has ended",
      ALREADY_HIGH_BIDDER: "You are already the highest bidder",
      CANNOT_BID_OWN: "Cannot bid on your own listing",
    };
    socket.emit("bid:error", {
      message: errorMessages[err.message] || "Failed to place bid",
      code: err.message,
    });
  }
}
