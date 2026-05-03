import { Server } from "socket.io";
import { RateLimiterRedis } from "rate-limiter-flexible";
import Redis from "ioredis";
import {
  BreakError,
  buyNowSpot,
  placeSpotBid,
  startBreaking,
  startSpotAuction,
  skipSpotAuction,
} from "../services/break.service";
import {
  maybeScheduleAutoReveal,
  maybeCompleteBreak,
  triggerManualSpin,
} from "../services/reveal.service";
import { emitSystemEvent } from "../services/chat-events.service";
import { broadcastStreamStats } from "../services/stream-stats.service";
import prisma from "../lib/prisma";
import logger from "../lib/logger";
import { AuthenticatedSocket } from "./index";

let bidLimiter: RateLimiterRedis | null = null;

try {
  const redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
  redisClient.on("error", (err) => logger.warn(err, "Bid rate limiter Redis error"));
  bidLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: "ratelimit:spotbid",
    points: 10,
    duration: 1,
  });
} catch {
  logger.warn("Bid rate limiter not available");
}

type Ack = (response: { ok: true } | ({ ok: false; error: string; message?: string } & Record<string, unknown>)) => void;

function safeAck(ack: unknown): Ack {
  if (typeof ack === "function") return ack as Ack;
  return () => {};
}

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Sign in to continue.",
  RATE_LIMITED: "Too many bids. Slow down!",
  SPOT_NOT_FOUND: "This spot no longer exists.",
  AUCTION_ENDED: "The auction has already ended.",
  NOT_AUCTION_MODE: "This spot is not in auction mode.",
  NOT_BUY_NOW_MODE: "This spot is not available for Buy It Now.",
  CANNOT_BID_OWN: "You can't bid on your own listing.",
  CANNOT_BUY_OWN: "You can't buy your own listing.",
  ALREADY_HIGH_BIDDER: "You are already the highest bidder.",
  BID_TOO_LOW: "Your bid is too low.",
  INSUFFICIENT_FUNDS: "Insufficient wallet balance.",
  SPOT_TAKEN: "This spot has already been claimed.",
  NOT_AUTHORIZED: "You're not authorized to do that.",
  BREAK_NOT_FOUND: "Break not found.",
  BREAK_NOT_FILLING: "This break has already started.",
  BREAK_NOT_STARTED: "Start the break before opening a spot auction.",
  BREAK_NOT_AUCTION_MODE: "This break is not an auction.",
  SPOT_NOT_AUCTIONABLE: "This spot's auction is not pending.",
  ANOTHER_AUCTION_ACTIVE: "Another spot auction is already active in this break.",
  INVALID_COUNTER_BID_TIME: "Counter-bid time must be 2, 3, 5, 7, or 10 seconds.",
  INVALID_DURATION: "Auction duration is invalid.",
  INVALID_STARTING_PRICE: "Starting price must be at least 1 cent.",
  SPOT_NOT_WON: "This spot has no winner yet.",
  SPOT_ALREADY_REVEALED: "This spot has already been revealed.",
  SPIN_NOT_APPLICABLE: "This break doesn't use per-spot spins.",
  SPIN_ALREADY_RUNNING: "A spin is already in progress for this spot.",
};

function ackError(ack: Ack, err: unknown) {
  if (err instanceof BreakError) {
    ack({ ok: false, error: err.code, message: ERROR_MESSAGES[err.code] ?? err.code, ...err.context });
  } else {
    logger.error(err, "Break WS handler error");
    ack({ ok: false, error: "INTERNAL", message: "Something went wrong." });
  }
}

async function streamIdForSpot(spotId: string): Promise<string | null> {
  const spot = await prisma.spot.findUnique({
    where: { id: spotId },
    select: { listing: { select: { streamId: true } } },
  });
  return spot?.listing.streamId ?? null;
}

export function registerBreakHandlers(io: Server, socket: AuthenticatedSocket) {
  // ─── Buyer: place bid on a spot ─────────────────────────────────────────
  socket.on("bid:place", async (data: { spotId?: string; amount?: number }, rawAck) => {
    const ack = safeAck(rawAck);
    if (!socket.user) return ack({ ok: false, error: "UNAUTHENTICATED" });
    if (!data?.spotId || typeof data.amount !== "number" || data.amount <= 0) {
      return ack({ ok: false, error: "BID_TOO_LOW" });
    }

    if (bidLimiter) {
      try {
        await bidLimiter.consume(socket.user.userId);
      } catch {
        return ack({ ok: false, error: "RATE_LIMITED", message: ERROR_MESSAGES.RATE_LIMITED });
      }
    }

    try {
      const result = await placeSpotBid(data.spotId, socket.user.userId, data.amount);

      io.to(`stream:${result.streamId}`).emit("spot:bid_placed", {
        spotId: result.spotId,
        listingId: result.listingId,
        amount: result.amount,
        bidderId: result.bidderId,
        bidderUsername: result.bidderUsername,
        bidderAvatarUrl: result.bidderAvatarUrl,
        newEndsAt: result.newEndsAt.toISOString(),
        bidCount: result.bidCount,
      });

      if (result.extended) {
        io.to(`stream:${result.streamId}`).emit("spot:auction_extended", {
          spotId: result.spotId,
          newEndsAt: result.newEndsAt.toISOString(),
        });
      }

      // Notify the previously-outbid user (private)
      if (result.previousHighBidderId) {
        io.to(`stream:${result.streamId}`).emit("spot:outbid", {
          spotId: result.spotId,
          previousHighBidderId: result.previousHighBidderId,
          newAmount: result.amount,
        });
      }

      // System chat events.
      const spotMeta = await prisma.spot.findUnique({
        where: { id: result.spotId },
        select: { spotNumber: true },
      });
      if (spotMeta) {
        void emitSystemEvent(result.streamId, {
          eventType: "new_bid",
          spotId: result.spotId,
          spotNumber: spotMeta.spotNumber,
          bidderId: result.bidderId,
          bidderUsername: result.bidderUsername,
          amount: result.amount,
        });
        if (result.extended) {
          void emitSystemEvent(result.streamId, {
            eventType: "timer_extended",
            spotId: result.spotId,
            spotNumber: spotMeta.spotNumber,
          });
        }
      }

      ack({ ok: true });
    } catch (err) {
      ackError(ack, err);
    }
  });

  // ─── Buyer: buy-it-now on a spot ────────────────────────────────────────
  socket.on("spot:buy_now", async (data: { spotId?: string }, rawAck) => {
    const ack = safeAck(rawAck);
    if (!socket.user) return ack({ ok: false, error: "UNAUTHENTICATED" });
    if (!data?.spotId) return ack({ ok: false, error: "SPOT_NOT_FOUND" });

    try {
      const result = await buyNowSpot(data.spotId, socket.user.userId);

      // Legacy spot:purchased event (still useful for spot-list refreshes).
      io.to(`stream:${result.streamId}`).emit("spot:purchased", {
        spotId: result.spot.id,
        listingId: result.listingId,
        buyerId: result.buyerId,
        buyerUsername: result.buyerUsername,
        buyerAvatarUrl: result.buyerAvatarUrl,
        soldPrice: result.spot.soldPrice ?? 0,
      });

      // Win toast — carries assignmentMode + autoRandomize + quickSpin so
      // the client knows whether to expect an auto-reveal, a manual spin,
      // or no reveal at all (pick_your / random_at_end).
      io.to(`stream:${result.streamId}`).emit("spot:won", {
        spotId: result.spot.id,
        listingId: result.listingId,
        spotNumber: result.spot.spotNumber,
        winnerId: result.buyerId,
        winnerUsername: result.buyerUsername,
        winnerAvatarUrl: result.buyerAvatarUrl,
        soldPrice: result.spot.soldPrice ?? 0,
        assignmentMode: result.assignmentMode,
        autoRandomize: result.autoRandomize,
        quickSpin: result.quickSpin,
      });

      io.to(`stream:${result.streamId}`).emit("wallet:balance_updated", {
        userId: result.buyerId,
        newBalance: result.newBalance,
      });

      void emitSystemEvent(result.streamId, {
        eventType: "spot_purchased",
        spotId: result.spot.id,
        spotNumber: result.spot.spotNumber,
        buyerId: result.buyerId,
        buyerUsername: result.buyerUsername,
        soldPrice: result.spot.soldPrice ?? 0,
      });
      void broadcastStreamStats(result.streamId).catch((err) =>
        logger.error(err, "broadcastStreamStats failed")
      );

      // Reveal pipeline self-gates on assignmentMode + autoRandomize.
      void maybeScheduleAutoReveal(result.spot.id).catch((err) =>
        logger.error(err, "maybeScheduleAutoReveal failed (buy_now)")
      );

      ack({ ok: true });
    } catch (err) {
      ackError(ack, err);
    }
  });

  // ─── Seller: start the break (filling → breaking) ───────────────────────
  socket.on("seller:start_break", async (data: { listingId?: string }, rawAck) => {
    const ack = safeAck(rawAck);
    if (!socket.user) return ack({ ok: false, error: "UNAUTHENTICATED" });
    if (!data?.listingId) return ack({ ok: false, error: "BREAK_NOT_FOUND" });

    try {
      const listing = await startBreaking(data.listingId, socket.user.userId);
      io.to(`stream:${listing.streamId}`).emit("break:started", {
        listingId: listing.id,
        startedAt: listing.startedAt?.toISOString(),
      });
      void emitSystemEvent(listing.streamId, {
        eventType: "break_started",
        listingId: listing.id,
        breakName: listing.breakName,
      });
      ack({ ok: true });
    } catch (err) {
      ackError(ack, err);
    }
  });

  // ─── Seller: start a per-spot auction ───────────────────────────────────
  socket.on(
    "seller:start_spot_auction",
    async (
      data: {
        spotId?: string;
        startingPrice?: number;
        suddenDeath?: boolean;
        counterBidTime?: number;
        initialDuration?: number;
      },
      rawAck
    ) => {
      const ack = safeAck(rawAck);
      if (!socket.user) return ack({ ok: false, error: "UNAUTHENTICATED" });
      if (!data?.spotId) return ack({ ok: false, error: "SPOT_NOT_FOUND" });

      try {
        const { spot, streamId } = await startSpotAuction(data.spotId, socket.user.userId, {
          startingPrice: data.startingPrice ?? 100,
          suddenDeath: !!data.suddenDeath,
          counterBidTime: data.counterBidTime ?? 10,
          initialDuration: data.initialDuration ?? 30,
        });

        io.to(`stream:${streamId}`).emit("spot:auction_started", {
          spotId: spot.id,
          listingId: spot.listingId,
          startingBid: spot.startingBid,
          endsAt: spot.auctionEndsAt?.toISOString(),
          counterBidTime: spot.counterBidTime,
          suddenDeath: spot.suddenDeath,
          initialDuration: spot.initialDuration,
          spotName: spot.spotName,
          spotNumber: spot.spotNumber,
        });

        void emitSystemEvent(streamId, {
          eventType: "auction_started",
          spotId: spot.id,
          spotNumber: spot.spotNumber,
          spotName: spot.spotName,
          startingBid: spot.startingBid ?? 0,
        });

        ack({ ok: true });
      } catch (err) {
        ackError(ack, err);
      }
    }
  );

  // ─── Seller: skip a pending spot auction ────────────────────────────────
  socket.on("seller:skip_spot", async (data: { spotId?: string }, rawAck) => {
    const ack = safeAck(rawAck);
    if (!socket.user) return ack({ ok: false, error: "UNAUTHENTICATED" });
    if (!data?.spotId) return ack({ ok: false, error: "SPOT_NOT_FOUND" });

    try {
      const updated = await skipSpotAuction(data.spotId, socket.user.userId);
      const streamId = await streamIdForSpot(updated.id);
      if (streamId) {
        io.to(`stream:${streamId}`).emit("spot:skipped", { spotId: updated.id });
      }
      // Skipping might be the last blocker — see if the break can complete.
      void maybeCompleteBreak(updated.listingId).catch((err) =>
        logger.error(err, "maybeCompleteBreak failed after skip")
      );
      ack({ ok: true });
    } catch (err) {
      ackError(ack, err);
    }
  });

  // ─── Seller: trigger the manual spin (autoRandomize=false) ──────────────
  socket.on("seller:spin_now", async (data: { spotId?: string }, rawAck) => {
    const ack = safeAck(rawAck);
    if (!socket.user) return ack({ ok: false, error: "UNAUTHENTICATED" });
    if (!data?.spotId) return ack({ ok: false, error: "SPOT_NOT_FOUND" });

    try {
      await triggerManualSpin(data.spotId, socket.user.userId);
      // No broadcast here — triggerManualSpin emits spot:spin_started
      // immediately and spot:revealed when the spin lands.
      ack({ ok: true });
    } catch (err) {
      ackError(ack, err);
    }
  });
}
