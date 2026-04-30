/*
  Warnings:

  - You are about to drop the column `bidIncrement` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the column `currentBid` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the column `endsAt` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the column `highBidderId` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the column `imageUrl` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the column `inventory` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the column `pricePerSpot` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the column `spotsSold` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the column `startingBid` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the column `totalSpots` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the `Bid` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SpotReservation` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `breakFormat` to the `Listing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `breakName` to the `Listing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sellingMode` to the `Listing` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Bid" DROP CONSTRAINT "Bid_bidderId_fkey";

-- DropForeignKey
ALTER TABLE "Bid" DROP CONSTRAINT "Bid_listingId_fkey";

-- DropForeignKey
ALTER TABLE "SpotReservation" DROP CONSTRAINT "SpotReservation_listingId_fkey";

-- DropForeignKey
ALTER TABLE "SpotReservation" DROP CONSTRAINT "SpotReservation_userId_fkey";

-- AlterTable
ALTER TABLE "Listing" DROP COLUMN "bidIncrement",
DROP COLUMN "currentBid",
DROP COLUMN "description",
DROP COLUMN "endsAt",
DROP COLUMN "highBidderId",
DROP COLUMN "imageUrl",
DROP COLUMN "inventory",
DROP COLUMN "price",
DROP COLUMN "pricePerSpot",
DROP COLUMN "spotsSold",
DROP COLUMN "startingBid",
DROP COLUMN "title",
DROP COLUMN "totalSpots",
ADD COLUMN     "autoRandomize" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "breakDescription" TEXT,
ADD COLUMN     "breakFormat" TEXT NOT NULL,
ADD COLUMN     "breakName" TEXT NOT NULL,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "quickSpin" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sellingMode" TEXT NOT NULL,
ADD COLUMN     "shippingProfile" TEXT NOT NULL DEFAULT '4-7oz',
ADD COLUMN     "spotPreset" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ALTER COLUMN "type" SET DEFAULT 'break';

-- DropTable
DROP TABLE "Bid";

-- DropTable
DROP TABLE "SpotReservation";

-- CreateTable
CREATE TABLE "Spot" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "spotNumber" INTEGER NOT NULL,
    "spotName" TEXT NOT NULL,
    "description" TEXT,
    "startingPrice" INTEGER NOT NULL,
    "assignedName" TEXT,
    "auctionStatus" TEXT NOT NULL DEFAULT 'pending',
    "auctionStartedAt" TIMESTAMP(3),
    "auctionEndsAt" TIMESTAMP(3),
    "startingBid" INTEGER,
    "currentBid" INTEGER,
    "bidCount" INTEGER NOT NULL DEFAULT 0,
    "highBidderId" TEXT,
    "suddenDeath" BOOLEAN NOT NULL DEFAULT false,
    "counterBidTime" INTEGER NOT NULL DEFAULT 10,
    "initialDuration" INTEGER NOT NULL DEFAULT 30,
    "winnerId" TEXT,
    "soldPrice" INTEGER,
    "soldAt" TIMESTAMP(3),
    "spinPlayedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Spot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpotBid" (
    "id" TEXT NOT NULL,
    "spotId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpotBid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletHold" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "spotId" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "WalletHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Spot_listingId_spotNumber_idx" ON "Spot"("listingId", "spotNumber");

-- CreateIndex
CREATE INDEX "Spot_auctionStatus_auctionEndsAt_idx" ON "Spot"("auctionStatus", "auctionEndsAt");

-- CreateIndex
CREATE INDEX "SpotBid_spotId_createdAt_idx" ON "SpotBid"("spotId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletHold_userId_status_idx" ON "WalletHold"("userId", "status");

-- CreateIndex
CREATE INDEX "WalletHold_spotId_idx" ON "WalletHold"("spotId");

-- CreateIndex
CREATE INDEX "Listing_streamId_status_idx" ON "Listing"("streamId", "status");

-- AddForeignKey
ALTER TABLE "Spot" ADD CONSTRAINT "Spot_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Spot" ADD CONSTRAINT "Spot_highBidderId_fkey" FOREIGN KEY ("highBidderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Spot" ADD CONSTRAINT "Spot_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotBid" ADD CONSTRAINT "SpotBid_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "Spot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotBid" ADD CONSTRAINT "SpotBid_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletHold" ADD CONSTRAINT "WalletHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletHold" ADD CONSTRAINT "WalletHold_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "Spot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
