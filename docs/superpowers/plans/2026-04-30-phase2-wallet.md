# Phase 2: Wallet System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Stripe-powered wallet top-up and in-app spending, with idempotent webhooks, atomic balance mutations, and a full transaction audit trail.

**Architecture:** Users pre-fund their wallet via Stripe PaymentIntent. On webhook confirmation, balance is credited atomically. Spending (future phases: bids, spots) deducts from wallet using `SELECT ... FOR UPDATE` row locking. A `ProcessedStripeEvent` table prevents double-processing. Frontend has a top-up modal with Stripe Payment Element and a wallet page showing balance + transaction history.

**Tech Stack:** Stripe (PaymentIntent + Payment Element + webhooks), Prisma (raw SQL for `FOR UPDATE`), Express, React, shadcn/ui

---

## File Structure

### Server (new + modified)

```
server/
  src/
    routes/wallet.ts            # NEW: wallet endpoints (balance, topup, transactions, webhook)
    services/wallet.service.ts  # NEW: createTopup, creditWallet, debitWallet, getTransactions
    lib/stripe.ts               # NEW: Stripe client singleton
  prisma/
    schema.prisma               # MODIFY: add ProcessedStripeEvent model
```

### Client (new + modified)

```
client/
  app/
    wallet/page.tsx             # NEW: wallet page (balance, topup, history)
  components/
    wallet/TopUpModal.tsx       # NEW: modal with preset amounts + Stripe Payment Element
    wallet/TransactionList.tsx  # NEW: transaction history list
  lib/
    mock-data.ts                # No changes needed
```

---

## Task 1: Add ProcessedStripeEvent model + Stripe deps

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/src/lib/stripe.ts`

### Schema addition:

```prisma
model ProcessedStripeEvent {
  id        String   @id
  type      String
  createdAt DateTime @default(now())
}
```

### Stripe client:

```typescript
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
});

export default stripe;
```

### Steps:
- Install `stripe` package in server
- Add ProcessedStripeEvent model to schema
- Run `npx prisma migrate dev --name add-processed-stripe-events`
- Create stripe.ts singleton
- Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to .env.example
- Commit

---

## Task 2: Wallet service

**Files:**
- Create: `server/src/services/wallet.service.ts`

### Implementation:

```typescript
import Stripe from "stripe";
import stripe from "../lib/stripe";
import prisma from "../lib/prisma";

export async function createTopupIntent(userId: string, amountCents: number) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: { userId, type: "wallet_topup" },
  });

  return { clientSecret: paymentIntent.client_secret };
}

export async function creditWallet(userId: string, amountCents: number, stripePaymentIntentId: string, stripeEventId: string) {
  // Idempotency: check if event already processed
  const existing = await prisma.processedStripeEvent.findUnique({ where: { id: stripeEventId } });
  if (existing) return null; // Already processed

  // Atomic credit using transaction
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

export async function debitWallet(userId: string, amountCents: number, description: string) {
  // Use raw query for SELECT ... FOR UPDATE
  const result = await prisma.$transaction(async (tx) => {
    // Lock the user row
    const [user] = await tx.$queryRawUnsafe<any[]>(
      `SELECT * FROM "User" WHERE id = $1 FOR UPDATE`,
      userId
    );

    if (!user || user."walletBalance" < amountCents) {
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

export async function getWalletTransactions(userId: string, limit = 50, offset = 0) {
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
```

### Steps:
- Create wallet.service.ts with all functions
- Commit

---

## Task 3: Wallet routes + Stripe webhook

**Files:**
- Create: `server/src/routes/wallet.ts`
- Modify: `server/src/index.ts`

### Routes:

- `GET /api/wallet/balance` (auth required) — returns balance in cents
- `GET /api/wallet/transactions` (auth required) — returns paginated transaction history
- `POST /api/wallet/topup` (auth required) — body: {amountCents} → creates PaymentIntent, returns clientSecret
- `POST /api/wallet/webhook` (NO auth, raw body) — Stripe webhook endpoint

### Critical: Webhook needs raw body
The webhook route MUST receive the raw body for signature verification. This means `express.json()` must NOT parse the webhook route. Add `express.raw({ type: "application/json" })` specifically for the webhook route, and mount it BEFORE the global json parser.

### Steps:
- Create wallet.ts routes
- Mount in index.ts (webhook route with raw body parser before json parser)
- Add STRIPE_WEBHOOK_SECRET env var validation
- Commit

---

## Task 4: Install Stripe on client + TopUpModal

**Files:**
- Create: `client/components/wallet/TopUpModal.tsx`

### Dependencies:
- `@stripe/stripe-js`
- `@stripe/react-stripe-js`

### TopUpModal:
- Preset amounts: $25, $50, $100, $250, custom input
- On amount select → call `POST /api/wallet/topup` to get clientSecret
- Render Stripe Payment Element
- On success → close modal, refresh balance
- Uses shadcn Dialog component

### Steps:
- Install Stripe frontend deps
- Create TopUpModal component
- Commit

---

## Task 5: Wallet page + TransactionList

**Files:**
- Create: `client/app/wallet/page.tsx`
- Create: `client/components/wallet/TransactionList.tsx`

### Wallet page:
- Shows current balance prominently
- "Add Funds" button opens TopUpModal
- Transaction history below (TransactionList component)
- Protected: redirect to /login if not authenticated

### TransactionList:
- Fetches from `GET /api/wallet/transactions`
- Shows: date, type (topup/purchase/refund), amount (+/-), balance after, description
- Green for credits, red for debits

### Steps:
- Create TransactionList component
- Create wallet page
- Commit

---

## Task 6: Wire wallet into Navbar

**Files:**
- Modify: `client/components/layout/Navbar.tsx`

### Changes:
- When logged in, show wallet balance next to avatar (e.g., "$50.00")
- Balance links to /wallet page
- This requires fetching balance on auth — add walletBalance to the user object already returned by /auth/me

### Steps:
- Update Navbar to show balance
- Commit
