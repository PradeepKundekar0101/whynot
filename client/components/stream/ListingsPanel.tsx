"use client";

import { useEffect, useState } from "react";
import { Socket } from "socket.io-client";
import { apiFetch } from "@/lib/api";
import { AuctionCard } from "./AuctionCard";
import { BreakCard } from "./BreakCard";

interface Listing {
  id: string;
  streamId: string;
  type: string;
  title: string;
  description?: string;
  status: string;
  // Auction
  startingBid?: number;
  currentBid?: number;
  bidIncrement?: number;
  highBidderId?: string;
  endsAt?: string;
  // Break
  totalSpots?: number;
  spotsSold?: number;
  pricePerSpot?: number;
  // Fixed price
  price?: number;
  inventory?: number;
}

interface ListingsPanelProps {
  streamId: string;
  socket: Socket | null;
}

export function ListingsPanel({ streamId, socket }: ListingsPanelProps) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  // Load listings
  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch(`/listings/stream/${streamId}`);
        if (res.ok) {
          const data = await res.json();
          setListings(data.listings);
        }
      } catch {
        // Failed to load listings
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [streamId]);

  // Listen for real-time updates
  useEffect(() => {
    if (!socket) return;

    const onNewListing = (data: { listing: Listing }) => {
      setListings(prev => [data.listing, ...prev]);
    };

    const onBid = (data: { listingId: string; currentBid: number; highBidderId: string }) => {
      setListings(prev => prev.map(l =>
        l.id === data.listingId
          ? { ...l, currentBid: data.currentBid, highBidderId: data.highBidderId }
          : l
      ));
    };

    const onExtended = (data: { listingId: string; endsAt: string }) => {
      setListings(prev => prev.map(l =>
        l.id === data.listingId ? { ...l, endsAt: data.endsAt } : l
      ));
    };

    const onSold = (data: { listingId: string; status: string }) => {
      setListings(prev => prev.map(l =>
        l.id === data.listingId ? { ...l, status: data.status } : l
      ));
    };

    const onSpotPurchased = (data: { listingId: string; spotsSold: number; totalSpots: number }) => {
      setListings(prev => prev.map(l =>
        l.id === data.listingId ? { ...l, spotsSold: data.spotsSold, totalSpots: data.totalSpots } : l
      ));
    };

    socket.on("listing:new", onNewListing);
    socket.on("listing:bid", onBid);
    socket.on("listing:extended", onExtended);
    socket.on("listing:sold", onSold);
    socket.on("spot:purchased", onSpotPurchased);

    return () => {
      socket.off("listing:new", onNewListing);
      socket.off("listing:bid", onBid);
      socket.off("listing:extended", onExtended);
      socket.off("listing:sold", onSold);
      socket.off("spot:purchased", onSpotPurchased);
    };
  }, [socket]);

  if (loading) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Loading listings...</p>
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="p-4">
        <h3 className="text-sm font-semibold mb-2">Shop</h3>
        <p className="text-sm text-muted-foreground">No listings yet.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-sm font-semibold">Shop</h3>
      {listings.map(listing => {
        if (listing.type === "auction") {
          return <AuctionCard key={listing.id} listing={listing} socket={socket} />;
        }
        if (listing.type === "break") {
          return <BreakCard key={listing.id} listing={listing} streamId={streamId} />;
        }
        return null;
      })}
    </div>
  );
}
