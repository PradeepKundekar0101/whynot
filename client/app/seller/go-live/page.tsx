"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import { Navbar } from "@/components/layout/Navbar";
import { CreateListingForm } from "@/components/seller/CreateListingForm";
import {
  LiveKitRoom,
  VideoTrack,
  useLocalParticipant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";

const CATEGORIES = [
  "Electronics",
  "Trading Card Games",
  "Pokemon Cards",
  "Sports Cards",
  "Sneakers",
  "Funko",
  "Vintage & Antiques",
  "Comics",
];

interface Listing {
  id: string;
  type: string;
  title: string;
  status: string;
}

function BroadcasterVideo() {
  const { localParticipant, cameraTrack } = useLocalParticipant();

  if (!cameraTrack || !cameraTrack.track) {
    return (
      <div className="flex items-center justify-center h-full bg-black text-white text-sm">
        Starting camera...
      </div>
    );
  }

  return (
    <VideoTrack
      trackRef={{
        participant: localParticipant,
        publication: cameraTrack,
        source: Track.Source.Camera,
      }}
      className="w-full h-full object-contain"
    />
  );
}

function ActiveListings({ streamId, refreshTrigger }: { streamId: string; refreshTrigger: number }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    try {
      const res = await apiFetch(`/listings/stream/${streamId}`);
      if (res.ok) {
        const data = await res.json();
        setListings(data.listings || []);
      }
    } catch {
      // Ignore fetch errors
    }
  }, [streamId]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings, refreshTrigger]);

  const handleClose = async (listingId: string) => {
    setActionLoading(listingId + "-close");
    try {
      await apiFetch(`/listings/${listingId}/close`, { method: "POST" });
      await fetchListings();
    } catch {
      // Ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleRandomize = async (listingId: string) => {
    setActionLoading(listingId + "-randomize");
    try {
      await apiFetch(`/listings/${listingId}/randomize`, { method: "POST" });
      await fetchListings();
    } catch {
      // Ignore
    } finally {
      setActionLoading(null);
    }
  };

  const activeListings = listings.filter(l => l.status === "active" || l.status === "open");

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Active Listings</h3>
      {activeListings.length === 0 ? (
        <p className="text-xs text-muted-foreground">No active listings yet.</p>
      ) : (
        activeListings.map(listing => (
          <div key={listing.id} className="rounded-lg border border-border p-3 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium leading-tight">{listing.title}</p>
                <p className="text-xs text-muted-foreground capitalize">{listing.type}</p>
              </div>
              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                Active
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleClose(listing.id)}
                disabled={actionLoading === listing.id + "-close"}
                className="flex-1 h-7 text-xs font-medium rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50 transition-colors"
              >
                {actionLoading === listing.id + "-close" ? "Closing..." : "Close"}
              </button>
              {listing.type === "break" && (
                <button
                  onClick={() => handleRandomize(listing.id)}
                  disabled={actionLoading === listing.id + "-randomize"}
                  className="flex-1 h-7 text-xs font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors"
                >
                  {actionLoading === listing.id + "-randomize" ? "..." : "Randomize"}
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function GoLivePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [streamData, setStreamData] = useState<{
    id: string;
    token: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [listingRefresh, setListingRefresh] = useState(0);

  const livekitUrl =
    process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880";

  const handleGoLive = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setStarting(true);

    try {
      const res = await apiFetch("/streams", {
        method: "POST",
        body: JSON.stringify({ title, category }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to start stream");
      }
      const data = await res.json();
      setStreamData({ id: data.stream.id, token: data.token });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start stream");
    } finally {
      setStarting(false);
    }
  };

  const handleEndStream = async () => {
    if (!streamData) return;
    try {
      await apiFetch(`/streams/${streamData.id}/end`, { method: "POST" });
    } catch {
      // Best effort
    }
    router.push("/");
  };

  const handleListingCreated = () => {
    setListingRefresh(prev => prev + 1);
  };

  if (isLoading) return null;
  if (!user) {
    router.push("/login");
    return null;
  }

  // Pre-live: show form
  if (!streamData) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-border p-6">
            <h1 className="text-2xl font-bold mb-1">Go Live</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Start streaming to your audience
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleGoLive} className="flex flex-col gap-4">
              <div>
                <label
                  htmlFor="title"
                  className="block text-sm font-medium mb-1"
                >
                  Stream Title
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={200}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="What are you streaming today?"
                />
              </div>

              <div>
                <label
                  htmlFor="category"
                  className="block text-sm font-medium mb-1"
                >
                  Category
                </label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={starting || !title}
                className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {starting ? "Starting..." : "Go Live"}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  // Live: show broadcaster view with listing management sidebar
  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/80 text-white z-10 shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 bg-red-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            LIVE
          </span>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <button
          onClick={handleEndStream}
          className="px-4 py-1.5 text-sm font-semibold rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
        >
          End Stream
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video — main area */}
        <div className="flex-1 min-w-0">
          <LiveKitRoom
            token={streamData.token}
            serverUrl={livekitUrl}
            connect={true}
            video={true}
            audio={true}
            className="w-full h-full"
          >
            <BroadcasterVideo />
          </LiveKitRoom>
        </div>

        {/* Right sidebar — listing management */}
        <div className="w-80 bg-white text-foreground border-l border-border p-4 overflow-y-auto flex flex-col gap-4 shrink-0">
          <CreateListingForm streamId={streamData.id} onCreated={handleListingCreated} />
          <hr className="border-border" />
          <ActiveListings streamId={streamData.id} refreshTrigger={listingRefresh} />
        </div>
      </div>
    </div>
  );
}
