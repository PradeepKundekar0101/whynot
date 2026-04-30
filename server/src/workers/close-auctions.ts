import prisma from "../lib/prisma";
import { emitToStream } from "../websocket/emitter";
import logger from "../lib/logger";

export async function closeExpiredAuctions(): Promise<number> {
  const expired = await prisma.listing.findMany({
    where: {
      type: "auction",
      status: "open",
      endsAt: { lt: new Date() },
    },
    include: { stream: { select: { sellerId: true } } },
  });

  let closed = 0;
  for (const listing of expired) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // Re-check status inside transaction to avoid double-closing
          const current = await tx.listing.findUniqueOrThrow({
            where: { id: listing.id },
          });
          if (current.status !== "open") return null;

          if (current.highBidderId && current.currentBid) {
            await tx.listing.update({
              where: { id: listing.id },
              data: { status: "sold" },
            });

            const platformFee = Math.round(current.currentBid * 0.05);
            const sellerAmount = current.currentBid - platformFee;

            await tx.user.update({
              where: { id: listing.stream.sellerId },
              data: { walletBalance: { increment: sellerAmount } },
            });

            const seller = await tx.user.findUniqueOrThrow({
              where: { id: listing.stream.sellerId },
            });
            await tx.walletTransaction.create({
              data: {
                userId: listing.stream.sellerId,
                type: "topup",
                amountCents: sellerAmount,
                balanceAfter: seller.walletBalance,
                description: `Sale of "${current.title}" (5% fee deducted)`,
              },
            });

            return {
              status: "sold" as const,
              winnerId: current.highBidderId,
              amount: current.currentBid,
            };
          } else {
            await tx.listing.update({
              where: { id: listing.id },
              data: { status: "cancelled" },
            });
            return { status: "cancelled" as const, winnerId: null, amount: 0 };
          }
        },
        { isolationLevel: "Serializable" }
      );

      if (result) {
        emitToStream(listing.streamId, "listing:sold", {
          listingId: listing.id,
          status: result.status,
          winnerId: result.winnerId,
          amount: result.amount,
        });
        if (result.status === "sold") {
          emitToStream(listing.streamId, "confetti", {});
        }
        closed++;
      }
    } catch (err) {
      logger.error(err, `Failed to close auction ${listing.id}`);
    }
  }

  return closed;
}
