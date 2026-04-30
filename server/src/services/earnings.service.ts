import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import logger from "../lib/logger";

export const PLATFORM_FEE_RATE = 0.10; // 10% — flat for now
export const ESCROW_HOLD_DAYS = 7;
export const TAX_RATE = 0.08;
export const DEFAULT_SHIPPING_CENTS = 499;
export const MIN_PAYOUT_CENTS = 1000; // $10

export class EarningsError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

export function platformFeeFor(amountCents: number): number {
  return Math.round(amountCents * PLATFORM_FEE_RATE);
}

export function sellerEarningsFor(amountCents: number): number {
  return amountCents - platformFeeFor(amountCents);
}

/**
 * Credit pending earnings to a seller when a spot is sold (auction ended OR
 * buy-it-now claimed). The buyer's wallet has already been debited; this is
 * the second leg — moving "money is somewhere" into "money is owed to seller".
 *
 * Idempotent: if there's already a 'sale_pending' transaction for this spot
 * we no-op so retries don't double-credit.
 */
export async function recordSalePending(
  tx: Prisma.TransactionClient,
  input: {
    sellerId: string;
    spotId: string;
    listingId: string;
    spotName: string;
    soldPriceCents: number;
  }
) {
  if (input.soldPriceCents <= 0) return null;

  const existing = await tx.earningsTransaction.findFirst({
    where: {
      userId: input.sellerId,
      type: "sale_pending",
      metadata: { path: ["spotId"], equals: input.spotId },
    },
  });
  if (existing) return existing;

  const sellerEarnings = sellerEarningsFor(input.soldPriceCents);
  const fee = platformFeeFor(input.soldPriceCents);

  const updated = await tx.user.update({
    where: { id: input.sellerId },
    data: { pendingEarningsCents: { increment: sellerEarnings } },
    select: { pendingEarningsCents: true, earningsBalanceCents: true },
  });

  return tx.earningsTransaction.create({
    data: {
      userId: input.sellerId,
      type: "sale_pending",
      amountCents: sellerEarnings,
      pendingBalanceAfter: updated.pendingEarningsCents,
      availableBalanceAfter: updated.earningsBalanceCents,
      description: `Sale pending — ${input.spotName}`,
      metadata: {
        spotId: input.spotId,
        listingId: input.listingId,
        platformFeeCents: fee,
        grossCents: input.soldPriceCents,
      },
    },
  });
}

/**
 * Move escrowed funds to the seller's available earnings balance.
 * Called by the escrow-release worker when releaseAt has passed.
 */
export async function releaseEscrow(escrowId: string) {
  return prisma.$transaction(async (tx) => {
    const escrow = await tx.platformEscrow.findUnique({ where: { id: escrowId } });
    if (!escrow) return null;
    if (escrow.status !== "held") return null;

    await tx.platformEscrow.update({
      where: { id: escrowId },
      data: { status: "released", releasedAt: new Date() },
    });

    const updated = await tx.user.update({
      where: { id: escrow.sellerId },
      data: {
        pendingEarningsCents: { decrement: escrow.sellerEarningsCents },
        earningsBalanceCents: { increment: escrow.sellerEarningsCents },
        totalLifetimeEarningsCents: { increment: escrow.sellerEarningsCents },
      },
      select: { pendingEarningsCents: true, earningsBalanceCents: true },
    });

    await tx.earningsTransaction.create({
      data: {
        userId: escrow.sellerId,
        type: "sale_released",
        amountCents: escrow.sellerEarningsCents,
        pendingBalanceAfter: updated.pendingEarningsCents,
        availableBalanceAfter: updated.earningsBalanceCents,
        orderId: escrow.orderId,
        description: `Funds released for order ${escrow.orderId.slice(0, 8)}`,
      },
    });

    return { escrow, balanceAfter: updated.earningsBalanceCents };
  });
}

export interface PayoutResult {
  payoutId: string;
  amountCents: number;
}

/**
 * Seller requests withdrawal of their available earnings.
 * Atomically: create Payout(status='requested'), zero out earningsBalance, log transaction.
 * The actual Stripe transfer is dispatched as a fire-and-forget mock job.
 */
export async function requestPayout(sellerId: string): Promise<PayoutResult> {
  const seller = await prisma.user.findUnique({ where: { id: sellerId } });
  if (!seller) throw new EarningsError("USER_NOT_FOUND");
  if (seller.earningsBalanceCents < MIN_PAYOUT_CENTS) {
    throw new EarningsError(
      "BELOW_MINIMUM",
      `Minimum payout is $${(MIN_PAYOUT_CENTS / 100).toFixed(2)}`
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    // Re-read inside the transaction with row lock semantics.
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: sellerId } });
    const amount = fresh.earningsBalanceCents;
    if (amount < MIN_PAYOUT_CENTS) throw new EarningsError("BELOW_MINIMUM");

    const payout = await tx.payout.create({
      data: {
        sellerId,
        amountCents: amount,
        status: "requested",
      },
    });

    await tx.user.update({
      where: { id: sellerId },
      data: { earningsBalanceCents: 0 },
    });

    await tx.earningsTransaction.create({
      data: {
        userId: sellerId,
        type: "payout_requested",
        amountCents: -amount,
        pendingBalanceAfter: fresh.pendingEarningsCents,
        availableBalanceAfter: 0,
        description: `Payout requested — $${(amount / 100).toFixed(2)}`,
        metadata: { payoutId: payout.id },
      },
    });

    return { payoutId: payout.id, amountCents: amount };
  });

  // Dispatch mock transfer (fire and forget).
  void mockProcessStripePayout(result.payoutId).catch((err) =>
    logger.error(err, "Mock payout processor failed")
  );

  return result;
}

/**
 * Mock Stripe Connect transfer. Marks the payout 'processing' immediately, then
 * after a short delay marks it 'paid'. In production this would call
 * stripe.transfers.create() with the seller's connected account ID.
 */
export async function mockProcessStripePayout(payoutId: string) {
  // Move to 'processing' immediately so the UI reflects state.
  await prisma.payout.update({
    where: { id: payoutId },
    data: { status: "processing" },
  });

  // Simulate bank rail delay.
  await new Promise((r) => setTimeout(r, 5000));

  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout || payout.status !== "processing") return;

  // 95% success rate for the mock — failures restore the seller's balance.
  const success = Math.random() < 0.95;
  if (!success) {
    await prisma.$transaction(async (tx) => {
      await tx.payout.update({
        where: { id: payoutId },
        data: { status: "failed", failedReason: "Mock processor: simulated bank decline" },
      });
      const restored = await tx.user.update({
        where: { id: payout.sellerId },
        data: { earningsBalanceCents: { increment: payout.amountCents } },
        select: { pendingEarningsCents: true, earningsBalanceCents: true },
      });
      await tx.earningsTransaction.create({
        data: {
          userId: payout.sellerId,
          type: "payout_failed",
          amountCents: payout.amountCents,
          pendingBalanceAfter: restored.pendingEarningsCents,
          availableBalanceAfter: restored.earningsBalanceCents,
          description: `Payout failed — funds restored`,
          metadata: { payoutId },
        },
      });
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.payout.update({
      where: { id: payoutId },
      data: {
        status: "paid",
        stripeTransferId: `mock_tr_${payoutId.slice(0, 12)}`,
        processedAt: new Date(),
      },
    });
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: payout.sellerId } });
    await tx.earningsTransaction.create({
      data: {
        userId: payout.sellerId,
        type: "payout_completed",
        amountCents: 0,
        pendingBalanceAfter: fresh.pendingEarningsCents,
        availableBalanceAfter: fresh.earningsBalanceCents,
        description: `Payout completed — $${(payout.amountCents / 100).toFixed(2)} sent to bank`,
        metadata: { payoutId },
      },
    });
  });
}

export async function getSellerEarningsSummary(sellerId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: sellerId },
    select: {
      earningsBalanceCents: true,
      pendingEarningsCents: true,
      totalLifetimeEarningsCents: true,
      payoutMethodSetupAt: true,
    },
  });
  return {
    availableCents: user.earningsBalanceCents,
    pendingCents: user.pendingEarningsCents,
    lifetimeCents: user.totalLifetimeEarningsCents,
    minPayoutCents: MIN_PAYOUT_CENTS,
    payoutMethodReady: !!user.payoutMethodSetupAt,
    nextEscrowReleaseAt: await nextEscrowReleaseAt(sellerId),
  };
}

async function nextEscrowReleaseAt(sellerId: string): Promise<Date | null> {
  const next = await prisma.platformEscrow.findFirst({
    where: { sellerId, status: "held" },
    orderBy: { releaseAt: "asc" },
    select: { releaseAt: true },
  });
  return next?.releaseAt ?? null;
}

export async function listEarningsTransactions(sellerId: string, take = 50) {
  return prisma.earningsTransaction.findMany({
    where: { userId: sellerId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function listPayouts(sellerId: string, take = 50) {
  return prisma.payout.findMany({
    where: { sellerId },
    orderBy: { requestedAt: "desc" },
    take,
  });
}
