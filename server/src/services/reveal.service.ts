import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import logger from "../lib/logger";
import { emitToStream } from "../websocket/emitter";
import {
  DEFAULT_SHIPPING_CENTS,
  ESCROW_HOLD_DAYS,
  TAX_RATE,
  platformFeeFor,
  sellerEarningsFor,
} from "./earnings.service";
import { emitSystemEvent } from "./chat-events.service";

/**
 * Delay between a spot being sold (auction won OR buy-it-now claimed) and
 * the team being revealed to all buyers. Matches the "X won the auction!"
 * → confetti reveal beat in the Whatnot UX.
 */
export const AUTO_REVEAL_DELAY_MS = 3000;

/**
 * Per-listing scheduled reveal timers. Keyed by spotId so re-entry (e.g.
 * server restart, double event) doesn't double-fire.
 *
 * On graceful shutdown we'd flush these; for now if the process dies
 * mid-delay the spot remains unrevealed but bookkeeping is still
 * consistent — the next process boot can sweep `soldAt is not null and
 * isRevealedToBuyers=false and revealedAt is null` to retry.
 */
const pendingReveals = new Map<string, NodeJS.Timeout>();

/**
 * Schedule the auto-reveal for a sold spot. Idempotent per spotId — calling
 * twice for the same spot keeps the original timer.
 *
 * The win toast (`spot:won`) is emitted by the caller IMMEDIATELY before this
 * call so buyers see the avatar + username overlay first; this just handles
 * the T+3s reveal pipeline.
 */
export function scheduleAutoReveal(spotId: string) {
  if (pendingReveals.has(spotId)) return;
  const timer = setTimeout(() => {
    pendingReveals.delete(spotId);
    void revealSpotAndAdvance(spotId).catch((err) =>
      logger.error(err, `Auto-reveal failed for spot ${spotId}`)
    );
  }, AUTO_REVEAL_DELAY_MS);
  pendingReveals.set(spotId, timer);
}

/**
 * Body of the auto-reveal: flips isRevealedToBuyers, broadcasts spot:revealed,
 * persists the chat event, then checks whether the break is complete.
 */
async function revealSpotAndAdvance(spotId: string) {
  const result = await prisma.$transaction(async (tx) => {
    // Atomic guard against double-reveal.
    const updated = await tx.spot.updateMany({
      where: { id: spotId, isRevealedToBuyers: false },
      data: { isRevealedToBuyers: true, revealedAt: new Date() },
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

  // The team to reveal is preAssignedTeam (set at break creation for random
  // and pick-your alike). Fall back to spotName if neither is set (legacy /
  // custom random with no preset).
  const revealedTeam = result.preAssignedTeam ?? result.revealText ?? result.spotName;
  const streamId = result.listing.stream.id;

  emitToStream(streamId, "spot:revealed", {
    spotId: result.id,
    listingId: result.listing.id,
    spotNumber: result.spotNumber,
    spotName: result.spotName,
    revealedTeam,
    winnerId: result.winnerId,
    winnerUsername: result.winner?.username ?? null,
    winnerAvatarUrl: result.winner?.avatarUrl ?? null,
    revealedAt: result.revealedAt?.toISOString() ?? new Date().toISOString(),
  });

  // Confetti pulse for everyone in the room.
  emitToStream(streamId, "confetti", {});

  void emitSystemEvent(streamId, {
    eventType: "spot_revealed",
    spotId: result.id,
    spotNumber: result.spotNumber,
    winnerId: result.winnerId,
    winnerUsername: result.winner?.username ?? null,
    revealText: revealedTeam,
  });

  // After the reveal lands, see if every spot is wrapped up so we can finalize
  // the break (build orders, escrow, etc.).
  await maybeCompleteBreak(result.listing.id);
}

/**
 * Has every spot in the break either reached a terminal auction state
 * (ended/skipped) AND been revealed to buyers (or had no winner)? If so,
 * mark the listing completed and stand up the order/escrow records.
 */
export async function maybeCompleteBreak(listingId: string) {
  // Any spot still mid-auction or sold-but-not-yet-revealed blocks completion.
  const blocking = await prisma.spot.count({
    where: {
      listingId,
      OR: [
        { auctionStatus: { in: ["pending", "active"] } },
        // Sold but reveal hasn't fired yet (winnerId set, isRevealedToBuyers false).
        { winnerId: { not: null }, isRevealedToBuyers: false },
      ],
    },
  });
  if (blocking > 0) return null;

  return completeBreak(listingId);
}

/**
 * Mark the break completed, build one consolidated Order per buyer (with line
 * items per won spot), and stand up a PlatformEscrow record per Order.
 *
 * Skipped auctions and unsold spots are excluded — orders only cover spots
 * with a real winner + soldPrice.
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
