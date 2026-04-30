"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, getAccessToken } from "@/lib/api";
import { Navbar } from "@/components/layout/Navbar";
import { LiveStreamPlayer } from "@/components/stream/LiveStreamPlayer";
import { ChatPanel } from "@/components/stream/ChatPanel";
import { ListingsPanel } from "@/components/stream/ListingsPanel";
import { ConfettiOverlay } from "@/components/stream/ConfettiOverlay";

interface StreamData {
  id: string;
  title: string;
  category: string;
  status: string;
  viewerCount: number;
  seller: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export default function StreamWatchPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const streamId = params.id as string;

  const [stream, setStream] = useState<StreamData | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [confettiCount, setConfettiCount] = useState(0);

  const livekitUrl =
    process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880";

  // Fetch stream details
  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch(`/streams/${streamId}`);
        if (!res.ok) {
          setError("Stream not found");
          return;
        }
        const data = await res.json();
        setStream(data.stream);
        setViewerCount(data.stream.viewerCount);
      } catch {
        setError("Failed to load stream");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [streamId]);

  // Join stream when user and stream are loaded
  useEffect(() => {
    if (!user || !stream || stream.status !== "live") return;

    let joined = false;
    const join = async () => {
      try {
        const res = await apiFetch(`/streams/${streamId}/join`, {
          method: "POST",
        });
        if (res.ok) {
          const data = await res.json();
          setToken(data.token);
          setViewerCount(data.viewerCount);
          joined = true;
        }
      } catch {
        // Failed to join
      }
    };
    join();

    return () => {
      if (joined) {
        apiFetch(`/streams/${streamId}/leave`, { method: "POST" }).catch(
          () => {}
        );
      }
    };
  }, [user, stream, streamId]);

  // Create shared Socket.IO connection
  useEffect(() => {
    const accessToken = getAccessToken();
    if (!accessToken || !stream) return;

    const s = io(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001", {
      auth: { token: accessToken },
    });

    s.on("connect", () => {
      s.emit("stream:join", streamId);
    });

    s.on("confetti", () => {
      setConfettiCount(c => c + 1);
    });

    setSocket(s);

    return () => {
      s.emit("stream:leave", streamId);
      s.disconnect();
      setSocket(null);
    };
  }, [stream, streamId]);

  if (loading || authLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading stream...</p>
        </main>
      </div>
    );
  }

  if (error || !stream) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-semibold mb-2">
              {error || "Stream not found"}
            </p>
            <button
              onClick={() => router.push("/")}
              className="text-sm text-primary hover:underline"
            >
              Back to home
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <div className="flex flex-1">
        {/* Left panel — listings/shop */}
        <aside className="hidden lg:flex flex-col w-80 border-r border-border overflow-y-auto">
          <ListingsPanel streamId={streamId} socket={socket} />
        </aside>

        {/* Center — Video */}
        <main className="flex-1 flex flex-col">
          <div className="relative bg-black aspect-[9/16] max-h-[calc(100vh-120px)] mx-auto w-full max-w-lg">
            {token ? (
              <LiveStreamPlayer
                token={token}
                serverUrl={livekitUrl}
                onDisconnected={() => setToken(null)}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-white text-sm">
                {stream.status === "live"
                  ? user
                    ? "Connecting to stream..."
                    : "Log in to watch this stream"
                  : "This stream has ended"}
              </div>
            )}

            {/* Live badge overlay */}
            {stream.status === "live" && (
              <div className="absolute top-3 left-3 flex items-center gap-1 bg-red-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                Live &middot; {viewerCount.toLocaleString()}
              </div>
            )}
          </div>

          {/* Stream info below video */}
          <div className="p-4">
            <div className="flex items-center gap-3">
              {stream.seller.avatarUrl ? (
                <img
                  src={stream.seller.avatarUrl}
                  alt=""
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground">
                  {stream.seller.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-semibold">{stream.seller.displayName}</p>
                <p className="text-sm text-muted-foreground">
                  @{stream.seller.username}
                </p>
              </div>
            </div>
            <h1 className="text-lg font-semibold mt-3">{stream.title}</h1>
            <span className="text-sm text-muted-foreground">
              {stream.category}
            </span>
          </div>
        </main>

        {/* Right panel — Chat */}
        <aside className="hidden lg:flex flex-col w-80 border-l border-border">
          <ChatPanel streamId={streamId} socket={socket} />
        </aside>
      </div>

      {/* Confetti overlay */}
      <ConfettiOverlay trigger={confettiCount} />
    </div>
  );
}
