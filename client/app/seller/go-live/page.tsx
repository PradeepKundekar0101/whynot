"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import { Navbar } from "@/components/layout/Navbar";
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

  // Live: show broadcaster view
  return (
    <div className="flex flex-col h-screen bg-black">
      <div className="flex items-center justify-between px-4 py-2 bg-black/80 text-white z-10">
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
      <div className="flex-1">
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
    </div>
  );
}
