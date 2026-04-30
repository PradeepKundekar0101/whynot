import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";

/**
 * Compute a user's *available* wallet balance: their stored balance minus
 * the sum of their currently-active holds. Use this everywhere we'd otherwise
 * read `user.walletBalance` directly when deciding if a transaction can proceed.
 */
export async function getAvailableBalance(
  userId: string,
  tx: Prisma.TransactionClient = prisma
): Promise<{ walletBalance: number; heldCents: number; availableCents: number }> {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { walletBalance: true },
  });
  const aggregate = await tx.walletHold.aggregate({
    where: { userId, status: "active" },
    _sum: { amountCents: true },
  });
  const heldCents = aggregate._sum.amountCents ?? 0;
  return {
    walletBalance: user.walletBalance,
    heldCents,
    availableCents: user.walletBalance - heldCents,
  };
}

/**
 * Place an active hold for a bid. Caller is responsible for transactionally
 * releasing any prior hold on the same spot for the same user.
 */
export async function placeHold(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    amountCents: number;
    spotId: string;
    reason: "spot_bid" | "spot_purchase";
  }
) {
  return tx.walletHold.create({
    data: {
      userId: input.userId,
      amountCents: input.amountCents,
      spotId: input.spotId,
      reason: input.reason,
      status: "active",
    },
  });
}

/**
 * Release any active hold(s) for {userId, spotId}. Returns the count released.
 */
export async function releaseHolds(
  tx: Prisma.TransactionClient,
  input: { userId: string; spotId: string }
) {
  const result = await tx.walletHold.updateMany({
    where: {
      userId: input.userId,
      spotId: input.spotId,
      status: "active",
    },
    data: { status: "released", releasedAt: new Date() },
  });
  return result.count;
}

/**
 * Release the active hold of every user *except* the winner on this spot.
 * Used when an auction ends — losers' wallets become available again.
 */
export async function releaseLoserHolds(
  tx: Prisma.TransactionClient,
  input: { spotId: string; winnerId: string | null }
) {
  const where: Prisma.WalletHoldWhereInput = {
    spotId: input.spotId,
    status: "active",
  };
  if (input.winnerId) {
    where.NOT = { userId: input.winnerId };
  }
  const result = await tx.walletHold.updateMany({
    where,
    data: { status: "released", releasedAt: new Date() },
  });
  return result.count;
}

/**
 * Capture the winning hold: turn it into a real wallet debit + WalletTransaction.
 * Returns the resulting WalletTransaction.
 */
export async function captureHold(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    spotId: string;
    description: string;
    metadata?: Record<string, unknown>;
  }
) {
  const hold = await tx.walletHold.findFirst({
    where: { userId: input.userId, spotId: input.spotId, status: "active" },
  });
  if (!hold) {
    // No active hold (e.g. a buy-it-now where we charge directly).
    // Still create a transaction record; caller has already debited the wallet.
    return null;
  }

  // Mark the hold as captured
  await tx.walletHold.update({
    where: { id: hold.id },
    data: { status: "captured", releasedAt: new Date() },
  });

  // Atomically debit the wallet (refuses to go negative)
  const debit = await tx.user.updateMany({
    where: { id: input.userId, walletBalance: { gte: hold.amountCents } },
    data: { walletBalance: { decrement: hold.amountCents } },
  });
  if (debit.count === 0) {
    // Should never happen because the hold guaranteed availability — log loudly.
    throw new Error("WALLET_UNDERFLOW_ON_CAPTURE");
  }

  const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });

  const transaction = await tx.walletTransaction.create({
    data: {
      userId: input.userId,
      type: "purchase",
      amountCents: -hold.amountCents,
      balanceAfter: user.walletBalance,
      description: input.description,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  return { hold, transaction, balanceAfter: user.walletBalance };
}
