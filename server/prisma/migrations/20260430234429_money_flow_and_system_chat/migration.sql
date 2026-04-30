-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_spotId_fkey";

-- DropIndex
DROP INDEX "Order_spotId_key";

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "eventData" JSONB,
ADD COLUMN     "eventType" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'user',
ALTER COLUMN "userId" DROP NOT NULL,
ALTER COLUMN "text" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "amountCents",
DROP COLUMN "revealText",
DROP COLUMN "spotId",
DROP COLUMN "spotName",
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "shippedAt" TIMESTAMP(3),
ADD COLUMN     "shippingCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subtotalCents" INTEGER NOT NULL,
ADD COLUMN     "taxCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalCents" INTEGER NOT NULL,
ADD COLUMN     "trackingNumber" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "earningsBalanceCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "payoutMethodSetupAt" TIMESTAMP(3),
ADD COLUMN     "pendingEarningsCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "totalLifetimeEarningsCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "spotId" TEXT NOT NULL,
    "spotName" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformEscrow" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "heldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releaseAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "platformFeeCents" INTEGER NOT NULL,
    "sellerEarningsCents" INTEGER NOT NULL,

    CONSTRAINT "PlatformEscrow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EarningsTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "pendingBalanceAfter" INTEGER NOT NULL,
    "availableBalanceAfter" INTEGER NOT NULL,
    "orderId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarningsTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "stripeTransferId" TEXT,
    "failedReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_spotId_key" ON "OrderItem"("spotId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformEscrow_orderId_key" ON "PlatformEscrow"("orderId");

-- CreateIndex
CREATE INDEX "PlatformEscrow_status_releaseAt_idx" ON "PlatformEscrow"("status", "releaseAt");

-- CreateIndex
CREATE INDEX "PlatformEscrow_sellerId_status_idx" ON "PlatformEscrow"("sellerId", "status");

-- CreateIndex
CREATE INDEX "EarningsTransaction_userId_createdAt_idx" ON "EarningsTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Payout_sellerId_status_idx" ON "Payout"("sellerId", "status");

-- CreateIndex
CREATE INDEX "Payout_status_requestedAt_idx" ON "Payout"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_streamId_createdAt_idx" ON "ChatMessage"("streamId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_listingId_buyerId_key" ON "Order"("listingId", "buyerId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "Spot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformEscrow" ADD CONSTRAINT "PlatformEscrow_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarningsTransaction" ADD CONSTRAINT "EarningsTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

