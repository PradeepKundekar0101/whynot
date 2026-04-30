"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

interface CreateListingFormProps {
  streamId: string;
  onCreated?: () => void;
}

const LISTING_TYPES = [
  { value: "auction", label: "Auction" },
  { value: "break", label: "Break" },
];

export function CreateListingForm({ streamId, onCreated }: CreateListingFormProps) {
  const [type, setType] = useState<"auction" | "break">("auction");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Auction fields
  const [startingBid, setStartingBid] = useState("1.00");
  const [bidIncrement, setBidIncrement] = useState("0.50");
  const [durationSeconds, setDurationSeconds] = useState("30");
  // Break fields
  const [totalSpots, setTotalSpots] = useState("10");
  const [pricePerSpot, setPricePerSpot] = useState("5.00");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const body: Record<string, unknown> = { streamId, type, title, description: description || undefined };

    if (type === "auction") {
      body.startingBid = Math.round(parseFloat(startingBid) * 100);
      body.bidIncrement = Math.round(parseFloat(bidIncrement) * 100);
      body.durationSeconds = parseInt(durationSeconds);
    } else if (type === "break") {
      body.totalSpots = parseInt(totalSpots);
      body.pricePerSpot = Math.round(parseFloat(pricePerSpot) * 100);
    }

    try {
      const res = await apiFetch("/listings", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to create listing");
      }
      // Reset form
      setTitle("");
      setDescription("");
      onCreated?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create listing");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Create Listing</h3>

      {/* Type selector */}
      <div className="flex gap-2">
        {LISTING_TYPES.map(t => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value as "auction" | "break")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              type === t.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Listing title"
        required
        maxLength={200}
        className="h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        maxLength={1000}
        rows={2}
        className="px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
      />

      {type === "auction" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Starting bid ($)</label>
              <input type="number" value={startingBid} onChange={(e) => setStartingBid(e.target.value)}
                step="0.01" min="0.01" required
                className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Bid increment ($)</label>
              <input type="number" value={bidIncrement} onChange={(e) => setBidIncrement(e.target.value)}
                step="0.01" min="0.01" required
                className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Duration (seconds)</label>
            <input type="number" value={durationSeconds} onChange={(e) => setDurationSeconds(e.target.value)}
              min="10" max="3600" required
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </>
      )}

      {type === "break" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Total spots</label>
            <input type="number" value={totalSpots} onChange={(e) => setTotalSpots(e.target.value)}
              min="1" max="100" required
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Price per spot ($)</label>
            <input type="number" value={pricePerSpot} onChange={(e) => setPricePerSpot(e.target.value)}
              step="0.01" min="0.01" required
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={loading || !title}
        className="h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {loading ? "Creating..." : "Create Listing"}
      </button>
    </form>
  );
}
