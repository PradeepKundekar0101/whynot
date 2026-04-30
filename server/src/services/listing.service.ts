import prisma from "../lib/prisma";
import crypto from "crypto";

export async function createListing(
  streamId: string,
  sellerId: string,
  data: {
    type: "auction" | "break" | "fixed_price" | "giveaway";
    title: string;
    description?: string;
    // Auction fields
    startingBid?: number;
    bidIncrement?: number;
    durationSeconds?: number;
    // Break fields
    totalSpots?: number;
    pricePerSpot?: number;
    // Fixed price
    price?: number;
    inventory?: number;
  }
) {
  // Verify stream is live and belongs to seller
  const stream = await prisma.stream.findUnique({ where: { id: streamId } });
  if (!stream || stream.status !== "live" || stream.sellerId !== sellerId) {
    throw new Error("INVALID_STREAM");
  }

  const listing = await prisma.listing.create({
    data: {
      streamId,
      type: data.type,
      title: data.title,
      description: data.description,
      status: "open",
      // Auction
      startingBid: data.startingBid,
      currentBid: data.type === "auction" ? 0 : null,
      bidIncrement: data.bidIncrement,
      endsAt:
        data.type === "auction" && data.durationSeconds
          ? new Date(Date.now() + data.durationSeconds * 1000)
          : null,
      // Break
      totalSpots: data.totalSpots,
      spotsSold: data.type === "break" ? 0 : null,
      pricePerSpot: data.pricePerSpot,
      // Fixed price
      price: data.price,
      inventory: data.inventory,
    },
  });

  return listing;
}

export async function placeBid(
  listingId: string,
  bidderId: string,
  amount: number
) {
  const result = await prisma.$transaction(async (tx) => {
    // Get listing (Serializable isolation prevents concurrent bid race conditions)
    const listing = await tx.listing.findUniqueOrThrow({
      where: { id: listingId },
    });

    if (listing.type !== "auction" || listing.status !== "open") {
      throw new Error("LISTING_NOT_AVAILABLE");
    }

    if (listing.endsAt && listing.endsAt < new Date()) {
      throw new Error("AUCTION_ENDED");
    }

    // Validate bid amount
    const minBid =
      listing.currentBid && listing.currentBid > 0
        ? listing.currentBid + (listing.bidIncrement || 1)
        : listing.startingBid || 1;

    if (amount < minBid) {
      throw new Error("BID_TOO_LOW");
    }

    // Can't bid on your own listing
    const stream = await tx.stream.findUnique({
      where: { id: listing.streamId },
      select: { sellerId: true },
    });
    if (stream?.sellerId === bidderId) {
      throw new Error("CANNOT_BID_OWN");
    }

    // Can't outbid yourself
    if (listing.highBidderId === bidderId) {
      throw new Error("ALREADY_HIGH_BIDDER");
    }

    // Refund previous high bidder (if any)
    if (listing.highBidderId && listing.currentBid) {
      await tx.user.update({
        where: { id: listing.highBidderId },
        data: { walletBalance: { increment: listing.currentBid } },
      });

      const refundedUser = await tx.user.findUniqueOrThrow({
        where: { id: listing.highBidderId },
      });

      await tx.walletTransaction.create({
        data: {
          userId: listing.highBidderId,
          type: "refund",
          amountCents: listing.currentBid,
          balanceAfter: refundedUser.walletBalance,
          description: `Bid refund for "${listing.title}"`,
        },
      });
    }

    // Debit new bidder — atomic check
    const debitResult = await tx.user.updateMany({
      where: { id: bidderId, walletBalance: { gte: amount } },
      data: { walletBalance: { decrement: amount } },
    });
    if (debitResult.count === 0) {
      throw new Error("INSUFFICIENT_FUNDS");
    }

    const bidder = await tx.user.findUniqueOrThrow({
      where: { id: bidderId },
    });

    await tx.walletTransaction.create({
      data: {
        userId: bidderId,
        type: "purchase",
        amountCents: -amount,
        balanceAfter: bidder.walletBalance,
        description: `Bid on "${listing.title}"`,
      },
    });

    // Anti-snipe: if within 10s of endsAt, extend by 10s
    let newEndsAt = listing.endsAt;
    if (listing.endsAt) {
      const timeLeft = listing.endsAt.getTime() - Date.now();
      if (timeLeft < 10000) {
        newEndsAt = new Date(Date.now() + 10000);
      }
    }

    // Update listing
    await tx.listing.update({
      where: { id: listingId },
      data: {
        currentBid: amount,
        highBidderId: bidderId,
        endsAt: newEndsAt,
      },
    });

    // Insert Bid record
    const bid = await tx.bid.create({
      data: {
        listingId,
        bidderId,
        amount,
      },
    });

    const extended = newEndsAt !== listing.endsAt;

    return {
      bid,
      listing: {
        ...listing,
        currentBid: amount,
        highBidderId: bidderId,
        endsAt: newEndsAt,
      },
      extended,
      bidder: { username: bidder.username, displayName: bidder.displayName },
    };
  }, { isolationLevel: "Serializable" });

  return result;
}

export async function reserveSpot(listingId: string, userId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUniqueOrThrow({
      where: { id: listingId },
    });

    if (listing.type !== "break" || listing.status !== "open") {
      throw new Error("LISTING_NOT_AVAILABLE");
    }
    if (!listing.totalSpots || !listing.pricePerSpot) {
      throw new Error("INVALID_BREAK");
    }
    if ((listing.spotsSold || 0) >= listing.totalSpots) {
      throw new Error("SOLD_OUT");
    }

    // Atomic increment spotsSold (only if still available)
    const updated = await tx.listing.updateMany({
      where: { id: listingId, spotsSold: { lt: listing.totalSpots } },
      data: { spotsSold: { increment: 1 } },
    });
    if (updated.count === 0) {
      throw new Error("SOLD_OUT");
    }

    // Debit wallet — atomic
    const debitResult = await tx.user.updateMany({
      where: { id: userId, walletBalance: { gte: listing.pricePerSpot } },
      data: { walletBalance: { decrement: listing.pricePerSpot } },
    });
    if (debitResult.count === 0) {
      // Rollback spot
      await tx.listing.update({
        where: { id: listingId },
        data: { spotsSold: { decrement: 1 } },
      });
      throw new Error("INSUFFICIENT_FUNDS");
    }

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

    await tx.walletTransaction.create({
      data: {
        userId,
        type: "purchase",
        amountCents: -listing.pricePerSpot,
        balanceAfter: user.walletBalance,
        description: `Spot in "${listing.title}"`,
      },
    });

    const reservation = await tx.spotReservation.create({
      data: {
        listingId,
        userId,
        status: "paid",
        heldUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Get updated listing
    const updatedListing = await tx.listing.findUniqueOrThrow({
      where: { id: listingId },
    });

    return {
      reservation,
      listing: updatedListing,
      user: { username: user.username, displayName: user.displayName },
    };
  });

  return result;
}

export async function randomizeSpots(listingId: string, sellerId: string) {
  // Verify seller owns the stream that owns this listing
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: {
      stream: { select: { sellerId: true } },
      reservations: {
        where: { status: "paid" },
        include: {
          user: { select: { username: true, displayName: true } },
        },
      },
    },
  });

  if (listing.stream.sellerId !== sellerId) {
    throw new Error("NOT_AUTHORIZED");
  }
  if (listing.type !== "break") {
    throw new Error("NOT_A_BREAK");
  }

  // Generate cryptographically secure seed
  const seed = crypto.randomBytes(32);
  const seedHash = crypto
    .createHash("sha256")
    .update(seed)
    .digest("hex");

  // Fisher-Yates shuffle using seed
  const reservations = [...listing.reservations];
  for (let i = reservations.length - 1; i > 0; i--) {
    const randomBytes = crypto
      .createHmac("sha256", seed)
      .update(Buffer.from([i]))
      .digest();
    const j = randomBytes.readUInt32BE(0) % (i + 1);
    [reservations[i], reservations[j]] = [reservations[j], reservations[i]];
  }

  // Assign spot numbers
  await prisma.$transaction(
    reservations.map((r, index) =>
      prisma.spotReservation.update({
        where: { id: r.id },
        data: { spotNumber: index + 1 },
      })
    )
  );

  return {
    assignments: reservations.map((r, i) => ({
      spotNumber: i + 1,
      userId: r.userId,
      username: r.user.username,
      displayName: r.user.displayName,
    })),
    seedHash,
    seed: seed.toString("hex"),
  };
}

export async function closeAuction(listingId: string, sellerId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUniqueOrThrow({
      where: { id: listingId },
    });

    // Verify seller owns this listing's stream
    const stream = await tx.stream.findUniqueOrThrow({
      where: { id: listing.streamId },
    });
    if (stream.sellerId !== sellerId) {
      throw new Error("NOT_AUTHORIZED");
    }

    if (listing.status !== "open" || listing.type !== "auction") {
      throw new Error("LISTING_NOT_AVAILABLE");
    }

    if (listing.highBidderId && listing.currentBid) {
      // Winner exists — mark as sold
      await tx.listing.update({
        where: { id: listingId },
        data: { status: "sold" },
      });

      // Credit seller (the bid hold already debited the winner)
      // stream already fetched above for auth check
      const platformFee = Math.round(listing.currentBid * 0.05); // 5% fee
      const sellerAmount = listing.currentBid - platformFee;

      await tx.user.update({
        where: { id: stream.sellerId },
        data: { walletBalance: { increment: sellerAmount } },
      });

      const seller = await tx.user.findUniqueOrThrow({
        where: { id: stream.sellerId },
      });
      await tx.walletTransaction.create({
        data: {
          userId: stream.sellerId,
          type: "topup",
          amountCents: sellerAmount,
          balanceAfter: seller.walletBalance,
          description: `Sale of "${listing.title}" (5% fee deducted)`,
        },
      });

      return {
        listing,
        status: "sold" as const,
        winnerId: listing.highBidderId,
        amount: listing.currentBid,
      };
    } else {
      // No bids — cancel
      await tx.listing.update({
        where: { id: listingId },
        data: { status: "cancelled" },
      });
      return {
        listing,
        status: "cancelled" as const,
        winnerId: null,
        amount: 0,
      };
    }
  }, { isolationLevel: "Serializable" });

  return result;
}

export async function getListingsForStream(streamId: string) {
  return prisma.listing.findMany({
    where: { streamId },
    orderBy: { createdAt: "desc" },
    include: {
      bids: { orderBy: { createdAt: "desc" }, take: 5 },
      reservations: {
        where: { status: "paid" },
        select: { id: true, userId: true, spotNumber: true },
      },
    },
  });
}
