import stripe from "../lib/stripe";
import prisma from "../lib/prisma";

export async function createTopupIntent(userId: string, amountCents: number) {
  // Validate amount
  if (amountCents < 100) {
    throw new Error("MINIMUM_AMOUNT");
  }
  if (amountCents > 100000) {
    throw new Error("MAXIMUM_AMOUNT");
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: { userId: user.id, type: "wallet_topup" },
  });

  return { clientSecret: paymentIntent.client_secret };
}

export async function creditWallet(
  userId: string,
  amountCents: number,
  stripePaymentIntentId: string,
  stripeEventId: string
) {
  // Idempotency check
  const existing = await prisma.processedStripeEvent.findUnique({
    where: { id: stripeEventId },
  });
  if (existing) return null;

  // Atomic credit
  const result = await prisma.$transaction(async (tx) => {
    await tx.processedStripeEvent.create({
      data: { id: stripeEventId, type: "payment_intent.succeeded" },
    });

    const user = await tx.user.update({
      where: { id: userId },
      data: { walletBalance: { increment: amountCents } },
    });

    const txn = await tx.walletTransaction.create({
      data: {
        userId,
        type: "topup",
        amountCents,
        balanceAfter: user.walletBalance,
        description: `Wallet top-up of $${(amountCents / 100).toFixed(2)}`,
        stripePaymentIntentId,
      },
    });

    return { user, txn };
  });

  return result;
}

export async function debitWallet(
  userId: string,
  amountCents: number,
  description: string
) {
  const result = await prisma.$transaction(async (tx) => {
    // Check balance first
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.walletBalance < amountCents) {
      throw new Error("INSUFFICIENT_FUNDS");
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: { walletBalance: { decrement: amountCents } },
    });

    const txn = await tx.walletTransaction.create({
      data: {
        userId,
        type: "purchase",
        amountCents: -amountCents,
        balanceAfter: updated.walletBalance,
        description,
      },
    });

    return { user: updated, txn };
  });

  return result;
}

export async function getWalletTransactions(
  userId: string,
  limit = 50,
  offset = 0
) {
  return prisma.walletTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

export async function getWalletBalance(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { walletBalance: true },
  });
  return user.walletBalance;
}
