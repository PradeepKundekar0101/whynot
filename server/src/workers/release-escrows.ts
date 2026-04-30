import prisma from "../lib/prisma";
import logger from "../lib/logger";
import { releaseEscrow } from "../services/earnings.service";

/**
 * Sweep: any escrow whose `releaseAt` is in the past and is still 'held' gets
 * moved to the seller's available earnings balance.
 *
 * Runs every minute in dev (so testing is fast); in production this would be
 * spaced out more.
 */
export async function releaseExpiredEscrows(): Promise<number> {
  const expired = await prisma.platformEscrow.findMany({
    where: { status: "held", releaseAt: { lte: new Date() } },
    select: { id: true },
    take: 50,
  });

  let released = 0;
  for (const { id } of expired) {
    try {
      const result = await releaseEscrow(id);
      if (result) released++;
    } catch (err) {
      logger.error(err, `Failed to release escrow ${id}`);
    }
  }
  return released;
}
