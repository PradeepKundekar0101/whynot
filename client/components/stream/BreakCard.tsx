"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";

interface BreakListing {
  id: string;
  title: string;
  status: string;
  totalSpots?: number;
  spotsSold?: number;
  pricePerSpot?: number;
}

export function BreakCard({ listing, streamId }: { listing: BreakListing; streamId: string }) {
  const { user } = useAuth();
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");

  const spots = listing.totalSpots || 0;
  const sold = listing.spotsSold || 0;
  const remaining = spots - sold;
  const progress = spots > 0 ? (sold / spots) * 100 : 0;
  const isSoldOut = remaining <= 0;

  const handleBuySpot = async () => {
    if (!user || buying) return;
    setBuying(true);
    setError("");

    try {
      const res = await apiFetch(`/listings/${listing.id}/reserve-spot`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to buy spot");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to buy spot");
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Break</span>
        <span className="text-xs text-muted-foreground">{remaining} of {spots} remaining</span>
      </div>

      <p className="text-sm font-medium mb-2">{listing.title}</p>

      {/* Progress bar */}
      <div className="w-full h-2 bg-secondary rounded-full mb-2 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">Price per spot</span>
        <span className="text-sm font-bold">${((listing.pricePerSpot || 0) / 100).toFixed(2)}</span>
      </div>

      {error && <p className="text-xs text-destructive mb-2">{error}</p>}

      {listing.status === "open" && user && !isSoldOut && (
        <button
          onClick={handleBuySpot}
          disabled={buying}
          className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {buying ? "Buying..." : "Buy Spot"}
        </button>
      )}

      {isSoldOut && (
        <p className="text-xs text-center text-muted-foreground font-semibold">Sold Out</p>
      )}
    </div>
  );
}
