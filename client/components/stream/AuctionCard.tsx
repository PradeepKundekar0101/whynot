"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Socket } from "socket.io-client";

interface AuctionListing {
  id: string;
  title: string;
  status: string;
  startingBid?: number;
  currentBid?: number;
  bidIncrement?: number;
  highBidderId?: string;
  endsAt?: string;
}

export function AuctionCard({ listing, socket }: { listing: AuctionListing; socket: Socket | null }) {
  const { user } = useAuth();
  const [timeLeft, setTimeLeft] = useState("");
  const [bidError, setBidError] = useState("");
  const [bidding, setBidding] = useState(false);

  const isHighBidder = user && listing.highBidderId === user.id;
  const minBid = listing.currentBid && listing.currentBid > 0
    ? listing.currentBid + (listing.bidIncrement || 1)
    : listing.startingBid || 1;

  // Countdown timer
  useEffect(() => {
    if (!listing.endsAt || listing.status !== "open") {
      setTimeLeft("");
      return;
    }

    const update = () => {
      const diff = new Date(listing.endsAt!).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("Ended");
      } else {
        const secs = Math.ceil(diff / 1000);
        setTimeLeft(`${secs}s`);
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [listing.endsAt, listing.status]);

  // Listen for bid errors
  useEffect(() => {
    if (!socket) return;
    const onError = (data: { message: string }) => {
      setBidError(data.message);
      setBidding(false);
      setTimeout(() => setBidError(""), 3000);
    };
    socket.on("bid:error", onError);
    return () => { socket.off("bid:error", onError); };
  }, [socket]);

  const handleBid = () => {
    if (!socket || !user || bidding) return;
    setBidding(true);
    setBidError("");
    socket.emit("bid:place", { listingId: listing.id, amount: minBid });
    // Reset bidding state after a short delay (server will respond with bid:error or listing:bid)
    setTimeout(() => setBidding(false), 2000);
  };

  const isSold = listing.status === "sold" || listing.status === "cancelled";

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Auction</span>
        {timeLeft && !isSold && (
          <span className={`text-xs font-semibold ${timeLeft === "Ended" ? "text-muted-foreground" : "text-live"}`}>
            {timeLeft}
          </span>
        )}
        {isSold && (
          <span className="text-xs font-semibold text-green-600">
            {listing.status === "sold" ? "Sold" : "Cancelled"}
          </span>
        )}
      </div>

      <p className="text-sm font-medium mb-1">{listing.title}</p>

      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">Current bid</span>
        <span className="text-sm font-bold">
          {listing.currentBid && listing.currentBid > 0
            ? `$${(listing.currentBid / 100).toFixed(2)}`
            : `$${((listing.startingBid || 0) / 100).toFixed(2)} start`}
        </span>
      </div>

      {isHighBidder && (
        <p className="text-xs text-green-600 font-semibold mb-2">You are the highest bidder!</p>
      )}

      {bidError && (
        <p className="text-xs text-destructive mb-2">{bidError}</p>
      )}

      {!isSold && listing.status === "open" && user && !isHighBidder && (
        <button
          onClick={handleBid}
          disabled={bidding || timeLeft === "Ended"}
          className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {bidding ? "Bidding..." : `Bid $${(minBid / 100).toFixed(2)}`}
        </button>
      )}
    </div>
  );
}
