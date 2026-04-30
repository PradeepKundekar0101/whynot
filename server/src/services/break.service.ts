import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { isValidPreset, isValidShippingProfile, SPOT_PRESETS } from "../lib/spot-presets";
import {
  captureHold,
  getAvailableBalance,
  placeHold,
  releaseHolds,
  releaseLoserHolds,
} from "./wallet-hold.service";
import { recordSalePending } from "./earnings.service";

export class BreakError extends Error {
  context: Record<string, unknown>;
  constructor(public code: string, context: Record<string, unknown> = {}) {
    super(code);
    this.context = context;
  }
}

export interface SpotInput {
  spotName: string;
  startingPrice: number; // cents
  description?: string;
}

export interface CreateBreakInput {
  streamId: string;
  breakName: string;
  breakDescription?: string;
  sellingMode: "auction" | "buy_it_now";
  breakFormat: "pick_your" | "random";
  spotPreset?: string;
  shippingProfile: string;
  autoRandomize?: boolean;
  quickSpin?: boolean;
  spots: SpotInput[];
}

export const DEFAULT_STARTING_PRICE_CENTS = 100; // $1
export const MAX_SPOTS_PER_BREAK = 500;

async function assertSellerOwnsStream(streamId: string, sellerId: string) {
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    select: { sellerId: true, status: true },
  });
  if (!stream) throw new BreakError("STREAM_NOT_FOUND");
  if (stream.sellerId !== sellerId) throw new BreakError("NOT_AUTHORIZED");
  return stream;
}

/**
 * Create a new break inside a Stream owned by the seller.
 * Pre-validates the spot rows; rejects if duplicate spot names or starting prices < 1 cent.
 */
export async function createBreak(sellerId: string, input: CreateBreakInput) {
  await assertSellerOwnsStream(input.streamId, sellerId);

  if (input.spots.length === 0) throw new BreakError("NO_SPOTS");
  if (input.spots.length > MAX_SPOTS_PER_BREAK) {
    throw new BreakError("TOO_MANY_SPOTS", { max: MAX_SPOTS_PER_BREAK });
  }
  if (input.spotPreset && input.spotPreset !== "custom" && !isValidPreset(input.spotPreset)) {
    throw new BreakError("INVALID_PRESET");
  }
  if (!isValidShippingProfile(input.shippingProfile)) {
    throw new BreakError("INVALID_SHIPPING_PROFILE");
  }

  const seenNames = new Set<string>();
  for (const s of input.spots) {
    const trimmed = s.spotName.trim();
    if (trimmed.length === 0) throw new BreakError("EMPTY_SPOT_NAME");
    if (seenNames.has(trimmed.toLowerCase())) {
      throw new BreakError("DUPLICATE_SPOT_NAME", { spotName: trimmed });
    }
    seenNames.add(trimmed.toLowerCase());
    if (!Number.isInteger(s.startingPrice) || s.startingPrice < 1) {
      throw new BreakError("INVALID_STARTING_PRICE", { spotName: trimmed });
    }
  }

  const listing = await prisma.listing.create({
    data: {
      streamId: input.streamId,
      type: "break",
      breakName: input.breakName,
      breakDescription: input.breakDescription,
      sellingMode: input.sellingMode,
      breakFormat: input.breakFormat,
      spotPreset: input.spotPreset,
      shippingProfile: input.shippingProfile,
      status: "filling",
      autoRandomize: input.autoRandomize ?? true,
      quickSpin: input.quickSpin ?? true,
      spots: {
        create: input.spots.map((s, i) => ({
          spotNumber: i + 1,
          spotName: s.spotName.trim(),
          description: s.description,
          startingPrice: s.startingPrice,
          // For pick_your, the assigned name is just the spot name.
          // For random, assignedName is filled in after the spin.
          assignedName: input.breakFormat === "pick_your" ? s.spotName.trim() : null,
        })),
      },
    },
    include: { spots: { orderBy: { spotNumber: "asc" } } },
  });

  return listing;
}

export async function listBreaksForStream(streamId: string) {
  return prisma.listing.findMany({
    where: { streamId },
    orderBy: { createdAt: "desc" },
    include: {
      spots: {
        orderBy: { spotNumber: "asc" },
        include: {
          highBidder: { select: { id: true, username: true, avatarUrl: true } },
          winner: { select: { id: true, username: true, avatarUrl: true } },
        },
      },
    },
  });
}

export async function getBreakById(listingId: string) {
  return prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      stream: { select: { id: true, sellerId: true, status: true } },
      spots: {
        orderBy: { spotNumber: "asc" },
        include: {
          highBidder: { select: { id: true, username: true, avatarUrl: true } },
          winner: { select: { id: true, username: true, avatarUrl: true } },
        },
      },
    },
  });
}

/**
 * Seller hits "Start Breaking" on a filling break. Flips status → 'breaking'.
 * Buyers will see "Breaking Now" instead of "Filling".
 */
export async function startBreaking(listingId: string, sellerId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { stream: { select: { sellerId: true, id: true } } },
  });
  if (!listing) throw new BreakError("BREAK_NOT_FOUND");
  if (listing.stream.sellerId !== sellerId) throw new BreakError("NOT_AUTHORIZED");
  if (listing.status !== "filling") throw new BreakError("BREAK_NOT_FILLING");

  return prisma.listing.update({
    where: { id: listingId },
    data: { status: "breaking", startedAt: new Date() },
  });
}

export async function cancelBreak(listingId: string, sellerId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { stream: { select: { sellerId: true } } },
  });
  if (!listing) throw new BreakError("BREAK_NOT_FOUND");
  if (listing.stream.sellerId !== sellerId) throw new BreakError("NOT_AUTHORIZED");
  if (listing.status === "completed") throw new BreakError("BREAK_ALREADY_COMPLETED");

  // Release all active holds against this break's spots
  await prisma.$transaction(async (tx) => {
    await tx.walletHold.updateMany({
      where: { spot: { listingId }, status: "active" },
      data: { status: "released", releasedAt: new Date() },
    });
    await tx.listing.update({
      where: { id: listingId },
      data: { status: "cancelled", completedAt: new Date() },
    });
  });
}

/**
 * Start a per-spot auction. Locks the listing+spot row. Rejects if another
 * spot in the same break is currently active (only one active auction per break).
 */
export async function startSpotAuction(
  spotId: string,
  sellerId: string,
  settings: {
    startingPrice: number; // cents
    suddenDeath: boolean;
    counterBidTime: number; // seconds (2|3|5|7|10)
    initialDuration: number; // seconds (default 30)
  }
) {
  const valid = [2, 3, 5, 7, 10];
  if (!valid.includes(settings.counterBidTime)) {
    throw new BreakError("INVALID_COUNTER_BID_TIME", { allowed: valid });
  }
  if (settings.initialDuration < 10 || settings.initialDuration > 600) {
    throw new BreakError("INVALID_DURATION");
  }
  if (settings.startingPrice < 1) {
    throw new BreakError("INVALID_STARTING_PRICE");
  }

  return prisma.$transaction(async (tx) => {
    const spot = await tx.spot.findUnique({
      where: { id: spotId },
      include: {
        listing: {
          select: { id: true, status: true, sellingMode: true, stream: { select: { sellerId: true, id: true } } },
        },
      },
    });
    if (!spot) throw new BreakError("SPOT_NOT_FOUND");
    if (spot.listing.stream.sellerId !== sellerId) throw new BreakError("NOT_AUTHORIZED");
    if (spot.listing.sellingMode !== "auction") throw new BreakError("BREAK_NOT_AUCTION_MODE");
    if (spot.auctionStatus !== "pending") throw new BreakError("SPOT_NOT_AUCTIONABLE");
    if (spot.listing.status !== "breaking") throw new BreakError("BREAK_NOT_STARTED");

    const otherActive = await tx.spot.findFirst({
      where: {
        listingId: spot.listing.id,
        auctionStatus: "active",
        NOT: { id: spotId },
      },
    });
    if (otherActive) {
      throw new BreakError("ANOTHER_AUCTION_ACTIVE", {
        spotId: otherActive.id,
        spotName: otherActive.spotName,
      });
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + settings.initialDuration * 1000);

    const updated = await tx.spot.update({
      where: { id: spotId },
      data: {
        auctionStatus: "active",
        auctionStartedAt: now,
        auctionEndsAt: endsAt,
        startingBid: settings.startingPrice,
        currentBid: null,
        bidCount: 0,
        highBidderId: null,
        suddenDeath: settings.suddenDeath,
        counterBidTime: settings.counterBidTime,
        initialDuration: settings.initialDuration,
      },
    });

    return { spot: updated, streamId: spot.listing.stream.id };
  });
}

export async function skipSpotAuction(spotId: string, sellerId: string) {
  return prisma.$transaction(async (tx) => {
    const spot = await tx.spot.findUnique({
      where: { id: spotId },
      include: { listing: { select: { stream: { select: { sellerId: true, id: true } } } } },
    });
    if (!spot) throw new BreakError("SPOT_NOT_FOUND");
    if (spot.listing.stream.sellerId !== sellerId) throw new BreakError("NOT_AUTHORIZED");
    if (spot.auctionStatus === "ended") throw new BreakError("SPOT_ALREADY_ENDED");

    // Release any holds against this spot
    await tx.walletHold.updateMany({
      where: { spotId, status: "active" },
      data: { status: "released", releasedAt: new Date() },
    });

    return tx.spot.update({
      where: { id: spotId },
      data: { auctionStatus: "skipped" },
    });
  });
}

/**
 * Place a bid on a spot. Atomic: row-locks spot & user, releases prior hold,
 * places new hold, anti-snipe extends the timer when applicable.
 *
 * Returns the broadcast payload + whether the auction-end job needs rescheduling.
 */
export async function placeSpotBid(
  spotId: string,
  bidderId: string,
  amountCents: number
) {
  if (!Number.isInteger(amountCents) || amountCents < 1) {
    throw new BreakError("BID_TOO_LOW");
  }

  return prisma.$transaction(async (tx) => {
    // Row-lock the spot to serialize concurrent bidders.
    const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Spot" WHERE id = ${spotId} FOR UPDATE
    `;
    if (lockedRows.length === 0) throw new BreakError("SPOT_NOT_FOUND");

    const spot = await tx.spot.findUnique({
      where: { id: spotId },
      include: {
        listing: {
          select: { sellingMode: true, status: true, stream: { select: { id: true, sellerId: true } } },
        },
        highBidder: { select: { id: true, username: true } },
      },
    });
    if (!spot) throw new BreakError("SPOT_NOT_FOUND");
    if (spot.listing.sellingMode !== "auction") throw new BreakError("NOT_AUCTION_MODE");
    if (spot.auctionStatus !== "active") throw new BreakError("AUCTION_ENDED");
    if (!spot.auctionEndsAt) throw new BreakError("AUCTION_ENDED");
    if (new Date() >= spot.auctionEndsAt) throw new BreakError("AUCTION_ENDED");
    if (spot.listing.stream.sellerId === bidderId) throw new BreakError("CANNOT_BID_OWN");

    const minBid = (spot.currentBid ?? spot.startingBid ?? 1) +
      (spot.currentBid ? 100 : 0); // +$1 once there's a current bid; else startingBid is fine
    if (amountCents < minBid) {
      throw new BreakError("BID_TOO_LOW", { minBid });
    }

    if (spot.highBidderId === bidderId) {
      throw new BreakError("ALREADY_HIGH_BIDDER");
    }

    // Check available balance (wallet minus existing holds — including any of theirs on this spot, but we'll release first)
    // Release the bidder's own previous hold(s) on this spot first, then check.
    await releaseHolds(tx, { userId: bidderId, spotId });

    const { availableCents } = await getAvailableBalance(bidderId, tx);
    if (availableCents < amountCents) {
      throw new BreakError("INSUFFICIENT_FUNDS", { availableCents });
    }

    // Release previous high bidder's hold (if any, and it's not us).
    if (spot.highBidderId && spot.highBidderId !== bidderId) {
      await releaseHolds(tx, { userId: spot.highBidderId, spotId });
    }

    // Place our new hold
    await placeHold(tx, {
      userId: bidderId,
      amountCents,
      spotId,
      reason: "spot_bid",
    });

    // Anti-snipe: if within counterBidTime seconds of end and not sudden death, extend.
    const now = new Date();
    const remainingMs = spot.auctionEndsAt.getTime() - now.getTime();
    const counterBidMs = spot.counterBidTime * 1000;
    let newEndsAt = spot.auctionEndsAt;
    let extended = false;
    if (!spot.suddenDeath && remainingMs < counterBidMs) {
      newEndsAt = new Date(now.getTime() + counterBidMs);
      extended = true;
    }

    const updated = await tx.spot.update({
      where: { id: spotId },
      data: {
        currentBid: amountCents,
        highBidderId: bidderId,
        bidCount: { increment: 1 },
        auctionEndsAt: newEndsAt,
      },
    });

    await tx.spotBid.create({
      data: { spotId, bidderId, amount: amountCents },
    });

    const bidder = await tx.user.findUniqueOrThrow({
      where: { id: bidderId },
      select: { username: true, avatarUrl: true },
    });

    return {
      streamId: spot.listing.stream.id,
      listingId: updated.listingId,
      spotId,
      amount: amountCents,
      bidderId,
      bidderUsername: bidder.username,
      bidderAvatarUrl: bidder.avatarUrl,
      newEndsAt,
      bidCount: updated.bidCount,
      previousHighBidderId: spot.highBidderId !== bidderId ? spot.highBidderId : null,
      extended,
      counterBidTime: spot.counterBidTime,
      suddenDeath: spot.suddenDeath,
    };
  });
}

/**
 * Buy It Now: atomically claim a spot at its starting price.
 * Releases no other holds (since auction mode and buy-it-now mode never co-exist on the same spot).
 */
export async function buyNowSpot(spotId: string, buyerId: string) {
  return prisma.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Spot" WHERE id = ${spotId} FOR UPDATE
    `;
    if (lockedRows.length === 0) throw new BreakError("SPOT_NOT_FOUND");

    const spot = await tx.spot.findUnique({
      where: { id: spotId },
      include: {
        listing: {
          select: {
            id: true,
            sellingMode: true,
            breakFormat: true,
            status: true,
            stream: { select: { id: true, sellerId: true } },
          },
        },
      },
    });
    if (!spot) throw new BreakError("SPOT_NOT_FOUND");
    if (spot.listing.sellingMode !== "buy_it_now") throw new BreakError("NOT_BUY_NOW_MODE");
    if (spot.winnerId) throw new BreakError("SPOT_TAKEN");
    if (spot.listing.stream.sellerId === buyerId) throw new BreakError("CANNOT_BUY_OWN");

    const price = spot.startingPrice;
    const { availableCents } = await getAvailableBalance(buyerId, tx);
    if (availableCents < price) {
      throw new BreakError("INSUFFICIENT_FUNDS", { availableCents });
    }

    // Direct debit (no hold needed for buy-it-now — instant capture).
    const debit = await tx.user.updateMany({
      where: { id: buyerId, walletBalance: { gte: price } },
      data: { walletBalance: { decrement: price } },
    });
    if (debit.count === 0) throw new BreakError("INSUFFICIENT_FUNDS");

    const buyer = await tx.user.findUniqueOrThrow({
      where: { id: buyerId },
      select: { walletBalance: true, username: true, avatarUrl: true },
    });

    await tx.walletTransaction.create({
      data: {
        userId: buyerId,
        type: "purchase",
        amountCents: -price,
        balanceAfter: buyer.walletBalance,
        description: `Bought spot in break: ${spot.spotName}`,
        metadata: { spotId, listingId: spot.listingId, mode: "buy_it_now" },
      },
    });

    // Credit the seller's pending earnings.
    await recordSalePending(tx, {
      sellerId: spot.listing.stream.sellerId,
      spotId,
      listingId: spot.listingId,
      spotName: spot.spotName,
      soldPriceCents: price,
    });

    const updated = await tx.spot.update({
      where: { id: spotId },
      data: {
        winnerId: buyerId,
        soldPrice: price,
        soldAt: new Date(),
        auctionStatus: "ended",
        // Pick-your: assignedName is already the spotName from creation.
        // Random: assignedName remains null until a spin runs.
      },
    });

    return {
      streamId: spot.listing.stream.id,
      listingId: spot.listing.id,
      spot: updated,
      buyerId,
      buyerUsername: buyer.username,
      buyerAvatarUrl: buyer.avatarUrl,
      newBalance: buyer.walletBalance,
      breakFormat: spot.listing.breakFormat,
    };
  });
}

/**
 * End an active auction whose timer has elapsed. Called by the auction-end worker.
 * Returns null if the auction was already closed or the timer was extended (no-op).
 */
export async function endSpotAuction(spotId: string) {
  return prisma.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Spot" WHERE id = ${spotId} FOR UPDATE
    `;
    if (lockedRows.length === 0) return null;

    const spot = await tx.spot.findUnique({
      where: { id: spotId },
      include: {
        listing: { select: { id: true, breakFormat: true, autoRandomize: true, stream: { select: { id: true, sellerId: true } } } },
      },
    });
    if (!spot || spot.auctionStatus !== "active") return null;
    if (!spot.auctionEndsAt || new Date() < spot.auctionEndsAt) {
      // Timer was extended — return new endsAt so caller reschedules.
      return { rescheduleAt: spot.auctionEndsAt };
    }

    const winnerId = spot.highBidderId;
    const soldPrice = spot.currentBid;

    if (!winnerId) {
      // No bids — mark ended with no winner.
      const updated = await tx.spot.update({
        where: { id: spotId },
        data: { auctionStatus: "ended", soldAt: new Date() },
      });
      return {
        spot: updated,
        winnerId: null,
        winnerUsername: null,
        soldPrice: 0,
        streamId: spot.listing.stream.id,
        listingId: spot.listing.id,
        breakFormat: spot.listing.breakFormat as "pick_your" | "random",
        autoRandomize: spot.listing.autoRandomize,
      };
    }

    // Release every loser hold; capture the winner's hold.
    await releaseLoserHolds(tx, { spotId, winnerId });
    const captured = await captureHold(tx, {
      userId: winnerId,
      spotId,
      description: `Won spot in break: ${spot.spotName}`,
      metadata: { spotId, listingId: spot.listingId, mode: "auction" },
    });

    // Credit the seller's pending earnings (held in escrow until break completes).
    await recordSalePending(tx, {
      sellerId: spot.listing.stream.sellerId,
      spotId,
      listingId: spot.listingId,
      spotName: spot.spotName,
      soldPriceCents: soldPrice ?? 0,
    });

    // Pick-your: assignedName already mirrors spotName (set at creation).
    // Random: assignedName stays null until the spin runs.
    const updated = await tx.spot.update({
      where: { id: spotId },
      data: {
        auctionStatus: "ended",
        winnerId,
        soldPrice: soldPrice ?? 0,
        soldAt: new Date(),
      },
      include: { winner: { select: { id: true, username: true, avatarUrl: true } } },
    });

    return {
      spot: updated,
      winnerId,
      winnerUsername: updated.winner?.username ?? null,
      winnerAvatarUrl: updated.winner?.avatarUrl ?? null,
      newBalanceCents: captured?.balanceAfter ?? null,
      soldPrice: soldPrice ?? 0,
      streamId: spot.listing.stream.id,
      listingId: spot.listing.id,
      breakFormat: spot.listing.breakFormat as "pick_your" | "random",
      autoRandomize: spot.listing.autoRandomize,
    };
  });
}

/**
 * Run the spin for a single random-format spot. Picks a random un-assigned name
 * from the break's pool. Returns the assigned name (caller broadcasts the events).
 *
 * If the break uses spotPreset='custom' we assign the spot's own spotName as a
 * sensible fallback (since there's no preset pool to pick from); custom random
 * breaks are uncommon but we shouldn't crash on them.
 */
export async function pickRandomAssignment(spotId: string) {
  const spot = await prisma.spot.findUnique({
    where: { id: spotId },
    include: { listing: { select: { id: true, spotPreset: true, breakFormat: true } } },
  });
  if (!spot) throw new BreakError("SPOT_NOT_FOUND");
  if (spot.listing.breakFormat !== "random") throw new BreakError("NOT_RANDOM_FORMAT");
  if (spot.assignedName) return { assignedName: spot.assignedName, candidates: [] as string[] };

  const presetKey = spot.listing.spotPreset;
  let pool: string[];
  if (presetKey && presetKey !== "custom" && isValidPreset(presetKey)) {
    pool = [...SPOT_PRESETS[presetKey]];
  } else {
    // Fallback: pool is the set of all spotNames in the break (e.g., user-defined teams)
    const allSpots = await prisma.spot.findMany({
      where: { listingId: spot.listing.id },
      select: { spotName: true },
    });
    pool = allSpots.map((s) => s.spotName);
  }

  const usedSpots = await prisma.spot.findMany({
    where: { listingId: spot.listing.id, assignedName: { not: null } },
    select: { assignedName: true },
  });
  const used = new Set(usedSpots.map((s) => s.assignedName!));

  const available = pool.filter((p) => !used.has(p));
  if (available.length === 0) {
    // No options left — assign to the spotName as a fallback (shouldn't happen with a proper preset).
    return { assignedName: spot.spotName, candidates: pool };
  }

  const idx = crypto.randomInt(0, available.length);
  const assignedName = available[idx];
  return { assignedName, candidates: available };
}

export async function commitSpinAssignment(spotId: string, assignedName: string) {
  return prisma.spot.update({
    where: { id: spotId },
    data: { assignedName, spinPlayedAt: new Date() },
    include: { winner: { select: { id: true, username: true, avatarUrl: true } } },
  });
}

/**
 * Are all spots in the break either ended or skipped? If yes, mark the listing 'completed'.
 */
export async function maybeCompleteBreak(listingId: string) {
  const remaining = await prisma.spot.count({
    where: {
      listingId,
      auctionStatus: { notIn: ["ended", "skipped"] },
      winnerId: null,
    },
  });
  if (remaining > 0) return null;

  return prisma.listing.update({
    where: { id: listingId },
    data: { status: "completed", completedAt: new Date() },
  });
}
