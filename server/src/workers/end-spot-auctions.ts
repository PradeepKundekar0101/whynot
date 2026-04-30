import prisma from "../lib/prisma";
import logger from "../lib/logger";
import { emitToStream } from "../websocket/emitter";
import {
  endSpotAuction,
  pickRandomAssignment,
  commitSpinAssignment,
} from "../services/break.service";
import { maybeStartReveal } from "../services/reveal.service";
import { emitSystemEvent } from "../services/chat-events.service";
import { broadcastStreamStats } from "../services/stream-stats.service";

/**
 * Sweep: end any active spot auctions whose timer has elapsed.
 * Runs every second. Idempotent — re-checks the row inside the transaction.
 */
export async function endExpiredSpotAuctions(): Promise<number> {
  const now = new Date();
  const expired = await prisma.spot.findMany({
    where: {
      auctionStatus: "active",
      auctionEndsAt: { lte: now },
    },
    select: { id: true },
    take: 50,
  });

  let ended = 0;
  for (const { id } of expired) {
    try {
      const result = await endSpotAuction(id);
      if (!result || "rescheduleAt" in result) continue;

      // Broadcast end
      emitToStream(result.streamId, "spot:auction_ended", {
        spotId: id,
        listingId: result.listingId,
        winnerId: result.winnerId,
        winnerUsername: result.winnerUsername,
        winnerAvatarUrl: result.winnerAvatarUrl ?? null,
        soldPrice: result.soldPrice,
      });

      // For winners, push their fresh wallet balance privately
      if (result.winnerId && result.newBalanceCents !== null && result.newBalanceCents !== undefined) {
        emitToStream(result.streamId, "wallet:balance_updated", {
          userId: result.winnerId,
          newBalance: result.newBalanceCents,
        });
      }

      // System chat event: spot won + live stats refresh
      if (result.winnerId && result.winnerUsername) {
        void emitSystemEvent(result.streamId, {
          eventType: "spot_won",
          spotId: result.spot.id,
          spotNumber: result.spot.spotNumber,
          winnerId: result.winnerId,
          winnerUsername: result.winnerUsername,
          soldPrice: result.soldPrice,
        });
        void broadcastStreamStats(result.streamId).catch((err) =>
          logger.error(err, "broadcastStreamStats failed")
        );
      }

      // Reveal mode replaces per-spot spinning. After every auction ends,
      // ask the reveal orchestrator whether the break is fully sold and ready
      // to enter randomizing → revealing.
      void maybeStartReveal(result.listingId).catch((err) =>
        logger.error(err, "maybeStartReveal failed")
      );

      ended++;
    } catch (err) {
      logger.error(err, `Failed to end spot auction ${id}`);
    }
  }

  return ended;
}

/**
 * Run a spin for a single won random-format spot. Broadcasts spin:started
 * immediately, waits for the configured spin duration, then commits and
 * broadcasts spin:completed + spot:assigned.
 *
 * Server is the source of truth for the assigned name — clients animate
 * but never compute the result themselves.
 */
export async function runSpin(spotId: string, streamId: string): Promise<void> {
  const spotMeta = await prisma.spot.findUnique({
    where: { id: spotId },
    include: { listing: { select: { quickSpin: true } } },
  });
  if (!spotMeta) return;

  const { assignedName, candidates } = await pickRandomAssignment(spotId);

  emitToStream(streamId, "spot:spin_started", {
    spotId,
    candidateNames: candidates,
    quickSpin: spotMeta.listing.quickSpin,
  });

  const spinDurationMs = spotMeta.listing.quickSpin ? 3000 : 6000;
  await new Promise((resolve) => setTimeout(resolve, spinDurationMs));

  const updated = await commitSpinAssignment(spotId, assignedName);

  emitToStream(streamId, "spot:spin_completed", {
    spotId,
    assignedName,
    winnerId: updated.winnerId,
    winnerUsername: updated.winner?.username ?? null,
  });

  emitToStream(streamId, "spot:assigned", {
    spotId,
    assignedName,
    winnerId: updated.winnerId,
    winnerUsername: updated.winner?.username ?? null,
  });

  emitToStream(streamId, "confetti", {});
}
