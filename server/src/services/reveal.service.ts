import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import logger from "../lib/logger";
import { emitToStream } from "../websocket/emitter";
import { BreakError } from "./break.service";
import {
  DEFAULT_SHIPPING_CENTS,
  ESCROW_HOLD_DAYS,
  TAX_RATE,
  platformFeeFor,
  sellerEarningsFor,
} from "./earnings.service";
import { emitSystemEvent } from "./chat-events.service";

const AUTO_ADVANCE_DELAY_MS = 4000;
const RANDOMIZING_BANNER_MS = 2000;

/** Fisher-Yates shuffle of the winnerIds across spots in a random-format break. */
async function shuffleAssignments(listingId: string) {
  await prisma.$transaction(async (tx) => {
    const spots = await tx.spot.findMany({
      where: { listingId, winnerId: { not: null } },
      orderBy: { spotNumber: "asc" },
      select: { id: true, winnerId: true },
    });
    if (spots.length < 2) return;

    const winners: (string | null)[] = spots.map((s) => s.winnerId);
    for (let i = winners.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [winners[i], winners[j]] = [winners[j], winners[i]];
    }

    for (let i = 0; i < spots.length; i++) {
      if (winners[i] !== spots[i].winnerId) {
        await tx.spot.update({
          where: { id: spots[i].id },
          data: { winnerId: winners[i] },
        });
      }
    }
  });
}

interface ListingForCompletion {
  id: string;
  streamId: string;
  status: string;
  breakFormat: string;
}

async function loadListingForCompletion(
  listingId: string,
  tx: Prisma.TransactionClient = prisma
): Promise<ListingForCompletion | null> {
  return tx.listing.findUnique({
    where: { id: listingId },
    select: { id: true, streamId: true, status: true, breakFormat: true },
  });
}

/**
 * Hook called after every successful spot purchase (auction or buy-it-now).
 * If the break has every spot accounted for (winner present OR auction skipped)
 * AND we're still in 'breaking' status, transition through the reveal lifecycle.
 *
 * Guarded against re-entry by checking listing.status atomically.
 */
export async function maybeStartReveal(listingId: string) {
  const listing = await loadListingForCompletion(listingId);
  if (!listing) return;
  if (listing.status !== "breaking" && listing.status !== "filling") return;

  // Are we waiting on any spot to finish its auction / get bought?
  // A spot is still "in play" if its auction is pending or active (not yet
  // resolved). A spot whose auction ENDED without a winner is considered
  // resolved (no winner = no fulfillment needed); same for explicitly skipped.
  const incompleteSpots = await prisma.spot.count({
    where: {
      listingId,
      auctionStatus: { in: ["pending", "active"] },
    },
  });
  if (incompleteSpots > 0) return;

  // We have at least 1 spot with a winner? Otherwise skip directly to completed.
  const wonCount = await prisma.spot.count({
    where: { listingId, winnerId: { not: null } },
  });
  if (wonCount === 0) {
    await prisma.listing.updateMany({
      where: { id: listingId, status: { in: ["filling", "breaking"] } },
      data: { status: "completed", completedAt: new Date() },
    });
    emitToStream(listing.streamId, "break:completed", { listingId, orderIds: [] });
    return;
  }

  if (listing.breakFormat === "random") {
    // Atomically transition to 'randomizing' so duplicate triggers no-op.
    const updated = await prisma.listing.updateMany({
      where: { id: listingId, status: { in: ["filling", "breaking"] } },
      data: { status: "randomizing" },
    });
    if (updated.count === 0) return; // someone else already advanced
    emitToStream(listing.streamId, "break:randomizing", { listingId });

    // Brief shuffle banner moment.
    await new Promise((r) => setTimeout(r, RANDOMIZING_BANNER_MS));
    await shuffleAssignments(listingId);

    await prisma.listing.update({
      where: { id: listingId },
      data: {
        status: "revealing",
        randomizationCompletedAt: new Date(),
        revealStartedAt: new Date(),
      },
    });
    await emitRevealingStarted(listingId, listing.streamId);
  } else {
    const updated = await prisma.listing.updateMany({
      where: { id: listingId, status: { in: ["filling", "breaking"] } },
      data: {
        status: "revealing",
        revealStartedAt: new Date(),
      },
    });
    if (updated.count === 0) return;
    await emitRevealingStarted(listingId, listing.streamId);
  }

  // Kick off the first reveal (auto-pick).
  await advanceToNextReveal(listingId);
}

async function emitRevealingStarted(listingId: string, streamId: string) {
  const spots = await prisma.spot.findMany({
    where: { listingId },
    orderBy: { spotNumber: "asc" },
    include: { winner: { select: { id: true, username: true, avatarUrl: true } } },
  });
  emitToStream(streamId, "break:revealing_started", {
    listingId,
    assignments: spots.map((s) => ({
      spotId: s.id,
      spotNumber: s.spotNumber,
      winnerId: s.winnerId,
      winnerUsername: s.winner?.username ?? null,
    })),
  });
}

/** Returns the next pending spot honoring pin > spotNumber order. */
async function pickNextPendingSpot(listingId: string) {
  return prisma.spot.findFirst({
    where: {
      listingId,
      revealStatus: "pending",
      winnerId: { not: null },
    },
    orderBy: [{ isPinned: "desc" }, { spotNumber: "asc" }],
  });
}

/**
 * Decide what to do after a confirm/skip:
 *   - any pending spot? start it
 *   - else any skipped spot? reset to pending and start it
 *   - else complete the break
 *
 * Always checks listing status first to no-op if break was already completed.
 */
export async function advanceToNextReveal(listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, streamId: true, status: true },
  });
  if (!listing) return;
  if (listing.status !== "revealing") return;

  const next = await pickNextPendingSpot(listingId);
  if (next) {
    await internalStartReveal(next.id, listingId, listing.streamId);
    return;
  }

  // No pending spots — bring back a skipped one if any exist.
  const skipped = await prisma.spot.findFirst({
    where: { listingId, revealStatus: "skipped", winnerId: { not: null } },
    orderBy: { spotNumber: "asc" },
  });
  if (skipped) {
    await prisma.spot.update({
      where: { id: skipped.id },
      data: { revealStatus: "pending" },
    });
    await internalStartReveal(skipped.id, listingId, listing.streamId);
    return;
  }

  // Everything done — complete the break.
  await completeBreak(listingId);
}

async function internalStartReveal(spotId: string, listingId: string, streamId: string) {
  const result = await prisma.$transaction(async (tx) => {
    // Atomic guard: is this spot still pending?
    const updated = await tx.spot.updateMany({
      where: { id: spotId, revealStatus: "pending" },
      data: { revealStatus: "revealing" },
    });
    if (updated.count === 0) return null;

    await tx.listing.update({
      where: { id: listingId },
      data: { currentRevealingSpotId: spotId },
    });

    return tx.spot.findUnique({
      where: { id: spotId },
      include: { winner: { select: { id: true, username: true, avatarUrl: true } } },
    });
  });

  if (!result) return;

  emitToStream(streamId, "spot:reveal_started", {
    spotId: result.id,
    listingId,
    spotNumber: result.spotNumber,
    spotName: result.spotName,
    winnerId: result.winnerId,
    winnerUsername: result.winner?.username ?? null,
    winnerAvatarUrl: result.winner?.avatarUrl ?? null,
  });
}

export async function startReveal(spotId: string, sellerId: string) {
  const spot = await prisma.spot.findUnique({
    where: { id: spotId },
    include: {
      listing: {
        select: {
          id: true,
          status: true,
          stream: { select: { id: true, sellerId: true } },
        },
      },
    },
  });
  if (!spot) throw new BreakError("SPOT_NOT_FOUND");
  if (spot.listing.stream.sellerId !== sellerId) throw new BreakError("NOT_AUTHORIZED");
  if (spot.listing.status !== "revealing") throw new BreakError("BREAK_NOT_REVEALING");
  if (spot.revealStatus !== "pending" && spot.revealStatus !== "skipped") {
    throw new BreakError("SPOT_NOT_REVEALABLE");
  }

  // Demote any other 'revealing' spot back to 'pending' (only one in spotlight).
  await prisma.spot.updateMany({
    where: { listingId: spot.listingId, revealStatus: "revealing", NOT: { id: spotId } },
    data: { revealStatus: "pending" },
  });
  // If skipped → pending so the start logic can flip to revealing.
  if (spot.revealStatus === "skipped") {
    await prisma.spot.update({
      where: { id: spotId },
      data: { revealStatus: "pending" },
    });
  }
  await internalStartReveal(spot.id, spot.listingId, spot.listing.stream.id);
}

export async function confirmReveal(
  spotId: string,
  sellerId: string,
  revealText: string
) {
  const trimmed = revealText.trim();
  if (trimmed.length === 0) throw new BreakError("EMPTY_REVEAL_TEXT");
  if (trimmed.length > 120) throw new BreakError("REVEAL_TEXT_TOO_LONG");

  const result = await prisma.$transaction(async (tx) => {
    const spot = await tx.spot.findUnique({
      where: { id: spotId },
      include: {
        listing: {
          select: { id: true, status: true, stream: { select: { id: true, sellerId: true } } },
        },
        winner: { select: { id: true, username: true, avatarUrl: true } },
      },
    });
    if (!spot) throw new BreakError("SPOT_NOT_FOUND");
    if (spot.listing.stream.sellerId !== sellerId) throw new BreakError("NOT_AUTHORIZED");
    if (spot.listing.status !== "revealing") throw new BreakError("BREAK_NOT_REVEALING");
    if (spot.revealStatus !== "revealing" && spot.revealStatus !== "revealed") {
      throw new BreakError("SPOT_NOT_REVEALABLE");
    }

    // Compute reveal order: max existing + 1 (only when first revealed).
    let revealOrder = spot.revealOrder;
    if (revealOrder === null) {
      const maxOrder = await tx.spot.aggregate({
        where: { listingId: spot.listingId, revealOrder: { not: null } },
        _max: { revealOrder: true },
      });
      revealOrder = (maxOrder._max.revealOrder ?? 0) + 1;
    }

    const wasFirstReveal = spot.revealStatus === "revealing";
    const updated = await tx.spot.update({
      where: { id: spotId },
      data: {
        revealStatus: "revealed",
        revealText: trimmed,
        revealedAt: spot.revealedAt ?? new Date(),
        revealOrder,
      },
      include: { winner: { select: { id: true, username: true, avatarUrl: true } } },
    });

    if (wasFirstReveal) {
      await tx.listing.update({
        where: { id: spot.listingId },
        data: { currentRevealingSpotId: null },
      });
    }

    return {
      spot: updated,
      streamId: spot.listing.stream.id,
      listingId: spot.listingId,
      isEdit: !wasFirstReveal,
    };
  });

  emitToStream(result.streamId, "spot:revealed", {
    spotId: result.spot.id,
    listingId: result.listingId,
    spotNumber: result.spot.spotNumber,
    spotName: result.spot.spotName,
    revealText: result.spot.revealText,
    winnerId: result.spot.winnerId,
    winnerUsername: result.spot.winner?.username ?? null,
    winnerAvatarUrl: result.spot.winner?.avatarUrl ?? null,
    revealOrder: result.spot.revealOrder,
    isEdit: result.isEdit,
  });

  // First reveal triggers auto-advance, confetti, and a chat event; edits don't.
  if (!result.isEdit) {
    emitToStream(result.streamId, "confetti", {});
    void emitSystemEvent(result.streamId, {
      eventType: "spot_revealed",
      spotId: result.spot.id,
      spotNumber: result.spot.spotNumber,
      winnerId: result.spot.winnerId,
      winnerUsername: result.spot.winner?.username ?? null,
      revealText: result.spot.revealText ?? "",
    });
    scheduleAutoAdvance(result.listingId);
  }

  return result.spot;
}

export async function skipReveal(spotId: string, sellerId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const spot = await tx.spot.findUnique({
      where: { id: spotId },
      include: {
        listing: {
          select: { id: true, status: true, stream: { select: { id: true, sellerId: true } } },
        },
      },
    });
    if (!spot) throw new BreakError("SPOT_NOT_FOUND");
    if (spot.listing.stream.sellerId !== sellerId) throw new BreakError("NOT_AUTHORIZED");
    if (spot.listing.status !== "revealing") throw new BreakError("BREAK_NOT_REVEALING");
    if (spot.revealStatus !== "revealing" && spot.revealStatus !== "pending") {
      throw new BreakError("SPOT_NOT_REVEALABLE");
    }

    const wasCurrent = spot.revealStatus === "revealing";
    await tx.spot.update({
      where: { id: spotId },
      data: { revealStatus: "skipped" },
    });
    if (wasCurrent) {
      await tx.listing.update({
        where: { id: spot.listingId },
        data: { currentRevealingSpotId: null },
      });
    }

    return { spot, streamId: spot.listing.stream.id, listingId: spot.listingId };
  });

  emitToStream(result.streamId, "spot:reveal_skipped", { spotId, listingId: result.listingId });
  // Move on immediately if this was the active spot.
  if (result.spot.revealStatus === "revealing") {
    await advanceToNextReveal(result.listingId);
  }

  return result.spot;
}

export async function togglePin(spotId: string, sellerId: string) {
  const spot = await prisma.spot.findUnique({
    where: { id: spotId },
    include: {
      listing: { select: { id: true, status: true, stream: { select: { id: true, sellerId: true } } } },
    },
  });
  if (!spot) throw new BreakError("SPOT_NOT_FOUND");
  if (spot.listing.stream.sellerId !== sellerId) throw new BreakError("NOT_AUTHORIZED");
  if (spot.listing.status !== "revealing") throw new BreakError("BREAK_NOT_REVEALING");

  const updated = await prisma.spot.update({
    where: { id: spotId },
    data: { isPinned: !spot.isPinned },
  });

  // Broadcast new ordering hint (clients sort locally).
  emitToStream(spot.listing.stream.id, "spot:reorder", {
    listingId: spot.listingId,
    spotId,
    isPinned: updated.isPinned,
  });

  return updated;
}

export async function rebroadcastReveal(spotId: string, sellerId: string) {
  const spot = await prisma.spot.findUnique({
    where: { id: spotId },
    include: {
      listing: { select: { stream: { select: { id: true, sellerId: true } } } },
      winner: { select: { id: true, username: true, avatarUrl: true } },
    },
  });
  if (!spot) throw new BreakError("SPOT_NOT_FOUND");
  if (spot.listing.stream.sellerId !== sellerId) throw new BreakError("NOT_AUTHORIZED");
  if (spot.revealStatus !== "revealed") throw new BreakError("SPOT_NOT_REVEALED");

  emitToStream(spot.listing.stream.id, "spot:revealed", {
    spotId: spot.id,
    listingId: spot.listingId,
    spotNumber: spot.spotNumber,
    spotName: spot.spotName,
    revealText: spot.revealText,
    winnerId: spot.winnerId,
    winnerUsername: spot.winner?.username ?? null,
    winnerAvatarUrl: spot.winner?.avatarUrl ?? null,
    revealOrder: spot.revealOrder,
    isEdit: false,
    isRebroadcast: true,
  });
  emitToStream(spot.listing.stream.id, "confetti", {});
}

/**
 * Mark the break completed, build one consolidated Order per buyer (with line
 * items per won spot), and stand up a PlatformEscrow record per Order.
 *
 * Skipped reveals are excluded — they're treated as the seller bowing out of
 * fulfilling that particular slot. (Future: refund the buyer's wallet.)
 */
export async function completeBreak(listingId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({
      where: { id: listingId },
      include: {
        stream: {
          select: {
            id: true,
            sellerId: true,
            domesticShippingFee: true,
            combinedShippingEnabled: true,
          },
        },
        spots: true,
      },
    });
    if (!listing) return null;
    if (listing.status === "completed") return null;

    const updated = await tx.listing.updateMany({
      where: { id: listingId, status: "revealing" },
      data: { status: "completed", completedAt: new Date(), currentRevealingSpotId: null },
    });
    if (updated.count === 0) return null;

    const eligibleSpots = listing.spots.filter(
      (s) => s.winnerId && s.soldPrice && s.revealStatus !== "skipped"
    );

    // Group by buyer.
    const byBuyer = new Map<string, typeof eligibleSpots>();
    for (const s of eligibleSpots) {
      const arr = byBuyer.get(s.winnerId!) ?? [];
      arr.push(s);
      byBuyer.set(s.winnerId!, arr);
    }

    const orderIds: string[] = [];
    const releaseAt = new Date(Date.now() + ESCROW_HOLD_DAYS * 24 * 60 * 60 * 1000);

    for (const [buyerId, buyerSpots] of byBuyer.entries()) {
      const subtotal = buyerSpots.reduce((sum, s) => sum + (s.soldPrice ?? 0), 0);
      const baseShipping = listing.stream.domesticShippingFee ?? DEFAULT_SHIPPING_CENTS;
      const shipping = listing.stream.combinedShippingEnabled
        ? baseShipping
        : baseShipping * buyerSpots.length;
      const tax = Math.round(subtotal * TAX_RATE);
      const total = subtotal + shipping + tax;

      // Idempotent: upsert the Order keyed on (listingId, buyerId).
      const order = await tx.order.upsert({
        where: { listingId_buyerId: { listingId, buyerId } },
        update: {},
        create: {
          buyerId,
          sellerId: listing.stream.sellerId,
          listingId,
          streamId: listing.stream.id,
          subtotalCents: subtotal,
          shippingCents: shipping,
          taxCents: tax,
          totalCents: total,
          status: "pending_shipment",
          shippingProfile: listing.shippingProfile,
          items: {
            create: buyerSpots.map((s) => ({
              spotId: s.id,
              spotName: s.spotName,
              description: s.revealText ?? `Spot #${s.spotNumber}`,
              priceCents: s.soldPrice ?? 0,
            })),
          },
        },
        select: { id: true },
      });
      orderIds.push(order.id);

      // Stand up the escrow record. Idempotent via the orderId unique key.
      const fee = platformFeeFor(subtotal);
      const sellerCut = sellerEarningsFor(subtotal);
      await tx.platformEscrow.upsert({
        where: { orderId: order.id },
        update: {},
        create: {
          orderId: order.id,
          amountCents: total,
          buyerId,
          sellerId: listing.stream.sellerId,
          status: "held",
          releaseAt,
          platformFeeCents: fee,
          sellerEarningsCents: sellerCut,
        },
      });
    }

    return { streamId: listing.stream.id, orderIds, sellerId: listing.stream.sellerId };
  });

  if (!result) return null;
  emitToStream(result.streamId, "break:completed", {
    listingId,
    orderIds: result.orderIds,
    sellerId: result.sellerId,
  });

  // Reload break name for the chat event copy.
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { breakName: true },
  });
  if (listing) {
    void emitSystemEvent(result.streamId, {
      eventType: "break_completed",
      listingId,
      breakName: listing.breakName,
      winnerCount: result.orderIds.length,
    });
  }
  return result;
}

const advanceTimers = new Map<string, NodeJS.Timeout>();

export function scheduleAutoAdvance(listingId: string) {
  const existing = advanceTimers.get(listingId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    advanceTimers.delete(listingId);
    advanceToNextReveal(listingId).catch((err) =>
      logger.error(err, `Auto-advance failed for listing ${listingId}`)
    );
  }, AUTO_ADVANCE_DELAY_MS);
  advanceTimers.set(listingId, t);
}

export function cancelAutoAdvance(listingId: string) {
  const existing = advanceTimers.get(listingId);
  if (existing) clearTimeout(existing);
  advanceTimers.delete(listingId);
}
