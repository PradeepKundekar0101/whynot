import crypto from "crypto";
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

/** Cryptographically random Fisher-Yates shuffle. Returns a new array. */
export function shuffleArray<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

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

  // For random+preset breaks, draw the shuffled team pool from the preset and
  // assign each spot a team at creation time. The team is hidden from buyers
  // (isRevealedToBuyers=false) until the auction-end auto-reveal flips it.
  // For pick-your, every spot's preAssignedTeam mirrors its spotName and is
  // visible from the start (isRevealedToBuyers=true).
  let preAssignedPool: (string | null)[] = new Array(input.spots.length).fill(null);
  if (input.breakFormat === "random") {
    const presetKey = input.spotPreset;
    if (presetKey && presetKey !== "custom" && isValidPreset(presetKey)) {
      const pool = SPOT_PRESETS[presetKey];
      if (pool.length < input.spots.length) {
        throw new BreakError("PRESET_TOO_SMALL", { preset: presetKey, available: pool.length });
      }
      const shuffled = shuffleArray(pool).slice(0, input.spots.length);
      preAssignedPool = shuffled;
    }
    // For random+custom we leave preAssignedTeam null; the seller will need to
    // upgrade to a preset to get auto-reveal. This matches the prior fallback.
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
          // Random format: spotName stays "Spot #N" (the buyer-facing label).
          // Pick-your: spotName is the team name.
          spotName: input.breakFormat === "random" ? `Spot #${i + 1}` : s.spotName.trim(),
          description: s.description,
          startingPrice: s.startingPrice,
          preAssignedTeam:
            input.breakFormat === "pick_your" ? s.spotName.trim() : preAssignedPool[i],
          // Pick-your spots are public from the start; random spots stay hidden
          // until the auction-end auto-reveal pipeline flips this.
          isRevealedToBuyers: input.breakFormat === "pick_your",
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
      stream: { select: { id: true, sellerId: true } },
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

// ─── Serialization ────────────────────────────────────────────────────────

interface RawSpot {
  id: string;
  listingId: string;
  spotNumber: number;
  spotName: string;
  description: string | null;
  startingPrice: number;
  preAssignedTeam: string | null;
  isRevealedToBuyers: boolean;
  revealedAt: Date | null;
  revealText: string | null;
  auctionStatus: string;
  auctionStartedAt: Date | null;
  auctionEndsAt: Date | null;
  startingBid: number | null;
  currentBid: number | null;
  bidCount: number;
  highBidderId: string | null;
  highBidder?: { id: string; username: string; avatarUrl: string | null } | null;
  suddenDeath: boolean;
  counterBidTime: number;
  initialDuration: number;
  winnerId: string | null;
  winner?: { id: string; username: string; avatarUrl: string | null } | null;
  soldPrice: number | null;
  soldAt: Date | null;
  createdAt: Date;
}

export interface SerializedSpot {
  id: string;
  listingId: string;
  spotNumber: number;
  spotName: string;
  description: string | null;
  startingPrice: number;
  /**
   * The team behind this spot, surfaced ONLY when:
   *   - the caller is the seller, OR
   *   - the caller is the winner of this spot, OR
   *   - the spot has been publicly revealed (isRevealedToBuyers=true).
   * For everyone else this is null even though preAssignedTeam exists in the DB.
   */
  revealedTeam: string | null;
  isRevealedToBuyers: boolean;
  revealedAt: string | null;
  auctionStatus: string;
  auctionStartedAt: string | null;
  auctionEndsAt: string | null;
  startingBid: number | null;
  currentBid: number | null;
  bidCount: number;
  highBidderId: string | null;
  highBidder: { id: string; username: string; avatarUrl: string | null } | null;
  suddenDeath: boolean;
  counterBidTime: number;
  initialDuration: number;
  winnerId: string | null;
  winner: { id: string; username: string; avatarUrl: string | null } | null;
  soldPrice: number | null;
  soldAt: string | null;
  createdAt: string;
}

/**
 * Strip server-only fields (currently `preAssignedTeam`) from a Spot row before
 * sending it to a non-seller buyer. The team only appears in `revealedTeam`
 * when the spot has actually been revealed or the caller won it.
 *
 * `viewerUserId` is the caller's user id (or null for anonymous). `isSeller`
 * skips all gating — sellers always see what's coming up next.
 */
export function serializeSpot(
  spot: RawSpot,
  viewerUserId: string | null,
  isSeller: boolean
): SerializedSpot {
  const isWinner = !!viewerUserId && spot.winnerId === viewerUserId;
  const canSeeTeam = isSeller || isWinner || spot.isRevealedToBuyers;
  const revealedTeam = canSeeTeam ? spot.preAssignedTeam ?? spot.revealText ?? null : null;

  return {
    id: spot.id,
    listingId: spot.listingId,
    spotNumber: spot.spotNumber,
    spotName: spot.spotName,
    description: spot.description,
    startingPrice: spot.startingPrice,
    revealedTeam,
    isRevealedToBuyers: spot.isRevealedToBuyers,
    revealedAt: spot.revealedAt?.toISOString() ?? null,
    auctionStatus: spot.auctionStatus,
    auctionStartedAt: spot.auctionStartedAt?.toISOString() ?? null,
    auctionEndsAt: spot.auctionEndsAt?.toISOString() ?? null,
    startingBid: spot.startingBid,
    currentBid: spot.currentBid,
    bidCount: spot.bidCount,
    highBidderId: spot.highBidderId,
    highBidder: spot.highBidder ?? null,
    suddenDeath: spot.suddenDeath,
    counterBidTime: spot.counterBidTime,
    initialDuration: spot.initialDuration,
    winnerId: spot.winnerId,
    winner: spot.winner ?? null,
    soldPrice: spot.soldPrice,
    soldAt: spot.soldAt?.toISOString() ?? null,
    createdAt: spot.createdAt.toISOString(),
  };
}

interface RawBreak {
  id: string;
  streamId: string;
  type: string;
  breakName: string;
  breakDescription: string | null;
  sellingMode: string;
  breakFormat: string;
  spotPreset: string | null;
  shippingProfile: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  autoRandomize: boolean;
  quickSpin: boolean;
  createdAt: Date;
  spots: RawSpot[];
  stream?: { id: string; sellerId: string };
}

export interface SerializedBreak {
  id: string;
  streamId: string;
  type: string;
  breakName: string;
  breakDescription: string | null;
  sellingMode: string;
  breakFormat: string;
  spotPreset: string | null;
  shippingProfile: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  autoRandomize: boolean;
  quickSpin: boolean;
  createdAt: string;
  spots: SerializedSpot[];
}

export function serializeBreak(
  brk: RawBreak,
  viewerUserId: string | null,
  sellerId?: string | null
): SerializedBreak {
  const isSeller = !!viewerUserId && (sellerId ?? brk.stream?.sellerId) === viewerUserId;
  return {
    id: brk.id,
    streamId: brk.streamId,
    type: brk.type,
    breakName: brk.breakName,
    breakDescription: brk.breakDescription,
    sellingMode: brk.sellingMode,
    breakFormat: brk.breakFormat,
    spotPreset: brk.spotPreset,
    shippingProfile: brk.shippingProfile,
    status: brk.status,
    startedAt: brk.startedAt?.toISOString() ?? null,
    completedAt: brk.completedAt?.toISOString() ?? null,
    autoRandomize: brk.autoRandomize,
    quickSpin: brk.quickSpin,
    createdAt: brk.createdAt.toISOString(),
    spots: brk.spots.map((s) => serializeSpot(s, viewerUserId, isSeller)),
  };
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

