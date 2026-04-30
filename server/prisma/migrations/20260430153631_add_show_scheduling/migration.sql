-- AlterTable
ALTER TABLE "Stream" ADD COLUMN     "allowChatReplays" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "boostEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "combinedShippingEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "domesticShippingFee" INTEGER,
ADD COLUMN     "freePickupEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isAdultContent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "moderatorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "notifyFollowers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "parentSeriesId" TEXT,
ADD COLUMN     "pickupAddressId" TEXT,
ADD COLUMN     "pickupInstructions" TEXT,
ADD COLUMN     "primaryCategory" TEXT,
ADD COLUMN     "primarySellingFormat" TEXT NOT NULL DEFAULT 'breaks',
ADD COLUMN     "primarySubcategory" TEXT,
ADD COLUMN     "recordingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "repeatRule" TEXT,
ADD COLUMN     "scheduledEndAt" TIMESTAMP(3),
ADD COLUMN     "scheduledStartAt" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "videoPreviewUrl" TEXT;

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE INDEX "Stream_status_scheduledStartAt_idx" ON "Stream"("status", "scheduledStartAt");

-- CreateIndex
CREATE INDEX "Stream_sellerId_status_idx" ON "Stream"("sellerId", "status");

-- CreateIndex
CREATE INDEX "Stream_primaryCategory_status_idx" ON "Stream"("primaryCategory", "status");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
