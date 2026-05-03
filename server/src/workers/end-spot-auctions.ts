import prisma from "../lib/prisma";
import logger from "../lib/logger";
import { emitToStream } from "../websocket/emitter";
import { endSpotAuction } from "../services/break.service";
import { maybeScheduleAutoReveal, maybeCompleteBreak } from "../services/reveal.service";
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

      // Whatnot-style auto-reveal flow:
      //   T+0  → spot:won  (top-of-video toast: "X won the auction!")
      //   T+3s → spot:revealed (toast morphs into team reveal + confetti)
      //
      // We always emit spot:auction_ended for legacy listeners (it's still
      // useful for ledgers/spot-list refreshes), and on top of that the
      // win toast lives on its own event so the client can give it the
      // distinct top-of-video treatment.
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

      // Win toast event + chat row + stats refresh — only when there's a winner.
      if (result.winnerId && result.winnerUsername) {
        emitToStream(result.streamId, "spot:won", {
          spotId: result.spot.id,
          listingId: result.listingId,
          spotNumber: result.spot.spotNumber,
          winnerId: result.winnerId,
          winnerUsername: result.winnerUsername,
          winnerAvatarUrl: result.winnerAvatarUrl ?? null,
          soldPrice: result.soldPrice,
          assignmentMode: result.assignmentMode,
          autoRandomize: result.autoRandomize,
          quickSpin: result.quickSpin,
        });

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

        // The reveal pipeline self-gates on assignmentMode + autoRandomize.
        // For pick_your / random_at_end / autoRandomize=false this no-ops.
        void maybeScheduleAutoReveal(result.spot.id).catch((err) =>
          logger.error(err, "maybeScheduleAutoReveal failed")
        );
      }

      // No winner OR random_at_end: still nudge completion in case this was
      // the last blocking spot.
      void maybeCompleteBreak(result.listingId).catch((err) =>
        logger.error(err, "maybeCompleteBreak failed")
      );

      ended++;
    } catch (err) {
      logger.error(err, `Failed to end spot auction ${id}`);
    }
  }

  return ended;
}
