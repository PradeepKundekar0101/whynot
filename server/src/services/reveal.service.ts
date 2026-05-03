import type { Prisma } from "@prisma/client";
import crypto from "crypto";
import prisma from "../lib/prisma";
import logger from "../lib/logger";
import { emitToStream } from "../websocket/emitter";
import { BreakError, shuffleArray } from "./break.service";
import {
  DEFAULT_SHIPPING_CENTS,
  ESCROW_HOLD_DAYS,
  TAX_RATE,
  platformFeeFor,
  sellerEarningsFor,
} from "./earnings.service";
import { emitSystemEvent } from "./chat-events.service";

/**
 * Reveal-beat duration. The "spin" animation runs for either 3 s (quickSpin)
 * or 6 s (slow spin) before the team is shown. Same value also drives the
 * automatic delay between win and reveal when autoRandomize is true — the
 * spin IS the delay in that mode.
 */
export const QUICK_SPIN_MS = 3000;
export const SLOW_SPIN_MS = 6000;

export function spinDurationMs(quickSpin: boolean): number {
  return quickSpin ? QUICK_SPIN_MS : SLOW_SPIN_MS;
}

/**
 * Per-spot scheduled reveal timers. Keyed by spotId so re-entry (server
 * restart, double event) doesn't double-fire. On graceful shutdown we'd flush
 * these; for now if the process dies mid-delay the spot sits as
 * `winnerId set, isRevealedToBuyers=false` and a future "Spin Now" by the
 * seller (or a sweep) can recover.
 */
const pendingReveals = new Map<string, NodeJS.Timeout>();

interface ScheduleOpts {
  /** Override the quickSpin delay; used only by tests. */
  delayMs?: number;
}

/**
 * Schedule the reveal sequence for a sold spot. Caller is responsible for
 * having already broadcast `spot:won` immediately so the win toast appears
 * first; this method just kicks off the spin → reveal pipeline.
 *
 * Behaviour by listing config:
 *   - assignmentMode pick_your    → no-op (the spot was always public)
 *   - assignmentMode random_at_end → no-op (handled by completeBreak)
 *   - autoRandomize false          → no-op (waits for seller "Spin Now")
 *   - otherwise                    → fires `spot:spin_started` immediately,
 *     then `spot:revealed` after spinDurationMs(quickSpin).
 */
export async function maybeScheduleAutoReveal(spotId: string, opts: ScheduleOpts = {}) {
  if (pendingReveals.has(spotId)) return;

  const meta = await prisma.spot.findUnique({
    where: { id: spotId },
    select: {
      isRevealedToBuyers: true,
      listing: {
        select: {
          assignmentMode: true,
          autoRandomize: true,
          quickSpin: true,
        },
      },
    },
  });
  if (!meta) return;
  if (meta.isRevealedToBuyers) return; // pick_your is born revealed; nothing to do.

  const mode = meta.listing.assignmentMode;
  // Pick-your needs no reveal; random_at_end is reveals-at-completion.
  if (mode === "pick_your" || mode === "random_at_end") return;

  // Manual mode: wait for the seller to click "Spin Now".
  if (!meta.listing.autoRandomize) return;

  const delay = opts.delayMs ?? spinDurationMs(meta.listing.quickSpin);
  startSpin(spotId, delay).catch((err) =>
    logger.error(err, `Auto-reveal kickoff failed for spot ${spotId}`)
  );
}

/**
 * Seller-triggered reveal for autoRandomize=false breaks. Mirrors the auto
 * path: emits spot:spin_started, then spot:revealed after spinDurationMs.
 *
 * Authorizes the caller as the stream's seller and rejects if the spot
 * isn't in a revealable state.
 */
export async function triggerManualSpin(spotId: string, sellerId: string) {
  const meta = await prisma.spot.findUnique({
    where: { id: spotId },
    select: {
      winnerId: true,
      isRevealedToBuyers: true,
      listing: {
        select: {
          assignmentMode: true,
          autoRandomize: true,
          quickSpin: true,
          stream: { select: { sellerId: true } },
        },
      },
    },
  });
  if (!meta) throw new BreakError("SPOT_NOT_FOUND");
  if (meta.listing.stream.sellerId !== sellerId) throw new BreakError("NOT_AUTHORIZED");
  if (!meta.winnerId) throw new BreakError("SPOT_NOT_WON");
  if (meta.isRevealedToBuyers) throw new BreakError("SPOT_ALREADY_REVEALED");
  const mode = meta.listing.assignmentMode;
  if (mode === "pick_your" || mode === "random_at_end") {
    throw new BreakError("SPIN_NOT_APPLICABLE", { assignmentMode: mode });
  }
  if (pendingReveals.has(spotId)) throw new BreakError("SPIN_ALREADY_RUNNING");

  await startSpin(spotId, spinDurationMs(meta.listing.quickSpin));
}

async function startSpin(spotId: string, delayMs: number) {
  // Resolve the team to land on now (so the spin candidates list is ready
  // for the client animation), but only persist the assignment when the
  // delay completes — that way a server crash mid-spin doesn't leave the
  // spot half-revealed.
  const resolution = await resolveAssignment(spotId);
  if (!resolution) return;

  emitToStream(resolution.streamId, "spot:spin_started", {
    spotId,
    listingId: resolution.listingId,
    spotNumber: resolution.spotNumber,
    candidates: resolution.candidates,
    durationMs: delayMs,
  });

  const timer = setTimeout(() => {
    pendingReveals.delete(spotId);
    void revealSpot(spotId, resolution.team).catch((err) =>
      logger.error(err, `Reveal commit failed for spot ${spotId}`)
    );
  }, delayMs);
  pendingReveals.set(spotId, timer);
}

interface AssignmentResolution {
  team: string;
  candidates: string[];
  streamId: string;
  listingId: string;
  spotNumber: number;
}

/**
 * Pick the team this spot will land on. For pre_assigned it's already on
 * the row; for random_per_spot we draw from unused pool entries.
 *
 * Returns the resolved team plus a candidates list for the client spin
 * animation (the server is the source of truth for the result; the wheel
 * just animates through the candidates).
 */
async function resolveAssignment(spotId: string): Promise<AssignmentResolution | null> {
  const spot = await prisma.spot.findUnique({
    where: { id: spotId },
    select: {
      spotNumber: true,
      preAssignedTeam: true,
      listing: {
        select: {
          id: true,
          assignmentMode: true,
          spotPool: true,
          stream: { select: { id: true } },
        },
      },
    },
  });
  if (!spot) return null;

  const streamId = spot.listing.stream.id;
  const listingId = spot.listing.id;

  if (spot.preAssignedTeam) {
    // pre_assigned (or a previous random_per_spot run that already commited).
    return {
      team: spot.preAssignedTeam,
      candidates: spot.listing.spotPool.length > 0 ? spot.listing.spotPool : [spot.preAssignedTeam],
      streamId,
      listingId,
      spotNumber: spot.spotNumber,
    };
  }

  // random_per_spot: pick from unused pool entries (entries not yet
  // assigned to a sibling spot).
  if (spot.listing.assignmentMode === "random_per_spot") {
    const used = await prisma.spot.findMany({
      where: { listingId, preAssignedTeam: { not: null } },
      select: { preAssignedTeam: true },
    });
    const usedSet = new Set(used.map((u) => u.preAssignedTeam!));
    const available = spot.listing.spotPool.filter((p) => !usedSet.has(p));
    if (available.length === 0) {
      // Should never happen if pool sized correctly at create time — fail
      // visibly so the seller knows the break is misconfigured.
      logger.error({ spotId, listingId }, "random_per_spot pool exhausted");
      return null;
    }
    const idx = crypto.randomInt(0, available.length);
    return {
      team: available[idx],
      candidates: available,
      streamId,
      listingId,
      spotNumber: spot.spotNumber,
    };
  }

  return null;
}

/**
 * Commit the resolved team to the spot, broadcast spot:revealed + confetti,
 * then check if the break is complete.
 */
async function revealSpot(spotId: string, team: string) {
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.spot.updateMany({
      where: { id: spotId, isRevealedToBuyers: false },
      data: {
        isRevealedToBuyers: true,
        revealedAt: new Date(),
        preAssignedTeam: team,
      },
    });
    if (updated.count === 0) return null;

    return tx.spot.findUnique({
      where: { id: spotId },
      include: {
        listing: { select: { id: true, breakName: true, stream: { select: { id: true } } } },
        winner: { select: { id: true, username: true, avatarUrl: true } },
      },
    });
  });

  if (!result || !result.winnerId) return;

  const streamId = result.listing.stream.id;
  emitToStream(streamId, "spot:revealed", {
    spotId: result.id,
    listingId: result.listing.id,
    spotNumber: result.spotNumber,
    spotName: result.spotName,
    revealedTeam: team,
    winnerId: result.winnerId,
    winnerUsername: result.winner?.username ?? null,
    winnerAvatarUrl: result.winner?.avatarUrl ?? null,
    revealedAt: result.revealedAt?.toISOString() ?? new Date().toISOString(),
  });
  emitToStream(streamId, "confetti", {});
  void emitSystemEvent(streamId, {
    eventType: "spot_revealed",
    spotId: result.id,
    spotNumber: result.spotNumber,
    winnerId: result.winnerId,
    winnerUsername: result.winner?.username ?? null,
    revealText: team,
  });

  await maybeCompleteBreak(result.listing.id);
}

interface ListingForCompletion {
  id: string;
  streamId: string;
  status: string;
  assignmentMode: string;
  spotPool: string[];
}

async function loadListingForCompletion(
  listingId: string,
  tx: Prisma.TransactionClient = prisma
): Promise<ListingForCompletion | null> {
  return tx.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      streamId: true,
      status: true,
      assignmentMode: true,
      spotPool: true,
    },
  });
}

/**
 * Has every spot in the break either reached a terminal auction state
 * (ended/skipped) AND been revealed to buyers (or had no winner)? If so,
 * mark the listing completed and stand up the order/escrow records.
 *
 * For random_at_end, sold spots block completion only on the auction itself
 * (not on per-spot reveal, which is skipped). The completion path then runs
 * one batch shuffle to assign every winner a team.
 */
export async function maybeCompleteBreak(listingId: string) {
  const listing = await loadListingForCompletion(listingId);
  if (!listing) return null;

  // Mid-auction spots always block completion regardless of assignmentMode.
  const midAuction = await prisma.spot.count({
    where: {
      listingId,
      auctionStatus: { in: ["pending", "active"] },
    },
  });
  if (midAuction > 0) return null;

  if (listing.assignmentMode !== "random_at_end") {
    // Per-spot reveal modes: also block on sold-but-not-revealed spots.
    const awaitingReveal = await prisma.spot.count({
      where: {
        listingId,
        winnerId: { not: null },
        isRevealedToBuyers: false,
      },
    });
    if (awaitingReveal > 0) return null;
  }

  return completeBreak(listingId);
}

/**
 * For random_at_end breaks: shuffle the pool one final time and assign each
 * sold spot a team in order. Broadcast a single `break:final_reveal` event
 * with all assignments so the client can run a group reveal animation.
 *
 * No-op for any other assignmentMode.
 */
async function runRandomAtEndAssignment(listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      assignmentMode: true,
      spotPool: true,
      breakName: true,
      stream: { select: { id: true } },
      spots: {
        where: { winnerId: { not: null } },
        orderBy: { spotNumber: "asc" },
        select: { id: true, spotNumber: true, winnerId: true, winner: { select: { username: true } } },
      },
    },
  });
  if (!listing || listing.assignmentMode !== "random_at_end") return;
  if (listing.spots.length === 0) return;

  const shuffled = shuffleArray(listing.spotPool).slice(0, listing.spots.length);

  const assignments: Array<{
    spotId: string;
    spotNumber: number;
    winnerId: string | null;
    winnerUsername: string | null;
    revealedTeam: string;
  }> = [];
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < listing.spots.length; i++) {
      const spot = listing.spots[i];
      const team = shuffled[i];
      await tx.spot.update({
        where: { id: spot.id },
        data: {
          preAssignedTeam: team,
          isRevealedToBuyers: true,
          revealedAt: new Date(),
        },
      });
      assignments.push({
        spotId: spot.id,
        spotNumber: spot.spotNumber,
        winnerId: spot.winnerId,
        winnerUsername: spot.winner?.username ?? null,
        revealedTeam: team,
      });
    }
  });

  emitToStream(listing.stream.id, "break:final_reveal", {
    listingId: listing.id,
    breakName: listing.breakName,
    assignments,
  });
}

/**
 * Mark the break completed, build one consolidated Order per buyer (with line
 * items per won spot), and stand up a PlatformEscrow record per Order.
 *
 * For random_at_end, runs the batch assignment first so OrderItems carry the
 * revealed team in their description.
 */
export async function completeBreak(listingId: string) {
  // random_at_end: do the batch reveal BEFORE writing orders so item
  // descriptions can reference the freshly-assigned team.
  await runRandomAtEndAssignment(listingId);

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
      where: { id: listingId, status: { in: ["filling", "breaking"] } },
      data: { status: "completed", completedAt: new Date() },
    });
    if (updated.count === 0) return null;

    const eligibleSpots = listing.spots.filter(
      (s) => s.winnerId && s.soldPrice && s.auctionStatus !== "skipped"
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
              description: s.preAssignedTeam ?? s.revealText ?? `Spot #${s.spotNumber}`,
              priceCents: s.soldPrice ?? 0,
            })),
          },
        },
        select: { id: true },
      });
      orderIds.push(order.id);

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
