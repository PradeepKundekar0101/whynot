import prisma from "../lib/prisma";
import { emitToStream } from "../websocket/emitter";
import { sellerEarningsFor } from "./earnings.service";

export interface StreamStats {
  totalSalesCents: number;
  uniqueBuyers: number;
  spotsSold: number;
  estimatedPayoutCents: number;
}

/**
 * Live revenue computed from sold spots — independent of Order/Escrow records,
 * so it updates the moment a spot is won (rather than only after the break completes).
 */
export async function getStreamStats(streamId: string): Promise<StreamStats> {
  const sold = await prisma.spot.findMany({
    where: { listing: { streamId }, winnerId: { not: null } },
    select: { soldPrice: true, winnerId: true },
  });

  const totalSalesCents = sold.reduce((sum, s) => sum + (s.soldPrice ?? 0), 0);
  const uniqueBuyers = new Set(sold.map((s) => s.winnerId).filter(Boolean)).size;

  return {
    totalSalesCents,
    uniqueBuyers,
    spotsSold: sold.length,
    estimatedPayoutCents: sellerEarningsFor(totalSalesCents),
  };
}

/**
 * Compute and broadcast the current stats to everyone in the stream room.
 * Fire-and-forget by callers; failures are logged but don't bubble.
 */
export async function broadcastStreamStats(streamId: string) {
  const stats = await getStreamStats(streamId);
  emitToStream(streamId, "stream:stats_updated", stats);
  return stats;
}
