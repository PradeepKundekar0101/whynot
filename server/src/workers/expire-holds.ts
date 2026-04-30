import prisma from "../lib/prisma";
import logger from "../lib/logger";

export async function expireHolds(): Promise<number> {
  const expired = await prisma.spotReservation.findMany({
    where: {
      status: "held",
      heldUntil: { lt: new Date() },
    },
  });

  let released = 0;
  for (const hold of expired) {
    try {
      await prisma.$transaction(async (tx) => {
        // Release the hold
        await tx.spotReservation.update({
          where: { id: hold.id },
          data: { status: "released" },
        });

        // Decrement spotsSold on the listing
        await tx.listing.update({
          where: { id: hold.listingId },
          data: { spotsSold: { decrement: 1 } },
        });

        // Refund the user — for "held" status they were charged at reservation time
        const listing = await tx.listing.findUniqueOrThrow({
          where: { id: hold.listingId },
        });
        if (listing.pricePerSpot) {
          await tx.user.update({
            where: { id: hold.userId },
            data: { walletBalance: { increment: listing.pricePerSpot } },
          });

          const user = await tx.user.findUniqueOrThrow({
            where: { id: hold.userId },
          });
          await tx.walletTransaction.create({
            data: {
              userId: hold.userId,
              type: "refund",
              amountCents: listing.pricePerSpot,
              balanceAfter: user.walletBalance,
              description: `Expired hold released for "${listing.title}"`,
            },
          });
        }
      });
      released++;
    } catch (err) {
      logger.error(err, `Failed to release hold ${hold.id}`);
    }
  }

  return released;
}
