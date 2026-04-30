"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { Search, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, getAccessToken, API_ORIGIN } from "@/lib/api";
import { Navbar } from "@/components/layout/Navbar";
import { LiveStreamPlayer } from "@/components/stream/LiveStreamPlayer";
import { ChatPanel } from "@/components/stream/ChatPanel";
import { ConfettiOverlay } from "@/components/stream/ConfettiOverlay";
import { BreakCardCompact } from "@/components/stream/break/BreakCardCompact";
import { SpotsListModal } from "@/components/stream/break/SpotsListModal";
import { ActiveAuctionOverlay } from "@/components/stream/break/ActiveAuctionOverlay";
import { SpinAnimation } from "@/components/stream/break/SpinAnimation";
import { RevealOverlay } from "@/components/stream/break/RevealOverlay";
import { PersonalWinModal } from "@/components/stream/break/PersonalWinModal";
import { findActiveSpot, useStreamBreaks } from "@/hooks/useStreamBreaks";
import type { Break } from "@/lib/break-types";
import { cn } from "@/lib/utils";

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

const BUYER_TABS = [
  { id: "auction", label: "Auction" },
  { id: "sold", label: "Sold" },
] as const;
type BuyerTab = (typeof BUYER_TABS)[number]["id"];

export default function StreamWatchPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading, refreshUser } = useAuth();
  const streamId = params.id as string;

  const [stream, setStream] = useState<StreamData | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeTab, setActiveTab] = useState<BuyerTab>("auction");
  const [search, setSearch] = useState("");
  const [openBreak, setOpenBreak] = useState<Break | null>(null);

  const livekitUrl =
    process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://unacademy-7s3z9grv.livekit.cloud";

  const {
    breaks,
    loading: breaksLoading,
    activeSpin,
    dismissSpin,
    activeReveal,
    randomizing,
    personalWin,
    dismissPersonalWin,
    confettiTick,
    walletBalance,
  } = useStreamBreaks(streamId, socket, user?.id);

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
    void load();
  }, [streamId]);

  // Refresh user (for wallet balance) when server pushes wallet:balance_updated.
  useEffect(() => {
    if (walletBalance !== null) {
      void refreshUser();
    }
  }, [walletBalance, refreshUser]);

  // Join stream when user + stream loaded
  useEffect(() => {
    if (!user || !stream || stream.status !== "live") return;
    let joined = false;
    const join = async () => {
      try {
        const res = await apiFetch(`/streams/${streamId}/join`, { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          setToken(data.token);
          setViewerCount(data.viewerCount);
          joined = true;
        }
      } catch {}
    };
    void join();
    return () => {
      if (joined) {
        apiFetch(`/streams/${streamId}/leave`, { method: "POST" }).catch(() => {});
      }
    };
  }, [user, stream, streamId]);

  // Socket — canonical "connect to external system" pattern.
  useEffect(() => {
    const accessToken = getAccessToken();
    if (!accessToken || !stream) return;

    const s = io(API_ORIGIN, { auth: { token: accessToken } });
    s.on("connect", () => s.emit("stream:join", streamId));
    /* eslint-disable react-hooks/set-state-in-effect */
    setSocket(s);

    return () => {
      s.emit("stream:leave", streamId);
      s.disconnect();
      setSocket(null);
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [stream, streamId]);

  const filtered = useMemo(() => {
    const list =
      activeTab === "sold"
        ? breaks.filter((b) => b.status === "completed")
        : breaks.filter((b) => b.status === "filling" || b.status === "breaking");
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((b) => b.breakName.toLowerCase().includes(q));
  }, [activeTab, breaks, search]);

  const activeSpotInfo = findActiveSpot(breaks);

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
            <p className="text-lg font-semibold mb-2">{error || "Stream not found"}</p>
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
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar />

      <div className="flex flex-1 min-h-0">
        {/* ── Left: Shop ───────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-80 border-r border-border bg-white min-h-0">
          <div className="px-4 pt-4 pb-2 shrink-0">
            <h2 className="text-lg font-bold tracking-tight">Shop</h2>
          </div>

          <div className="px-4 pb-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search breaks..."
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 pb-3 shrink-0">
            {BUYER_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-3 h-8 rounded-full text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-secondary"
                )}
              >
                {tab.label}
              </button>
            ))}
            <button
              type="button"
              disabled
              title="Filter / sort coming soon"
              className="ml-auto text-xs text-muted-foreground cursor-not-allowed"
            >
              Filter · Sort
            </button>
          </div>

          {/* Break list */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-3 min-h-0">
            {breaksLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {activeTab === "sold" ? "No completed breaks yet." : "No breaks in this show yet."}
              </p>
            ) : (
              filtered.map((b) => (
                <BreakCardCompact
                  key={b.id}
                  break={b}
                  active={activeSpotInfo?.breakItem.id === b.id}
                  onSeeSpots={(brk) => setOpenBreak(brk)}
                />
              ))
            )}
          </div>
        </aside>

        {/* ── Center: Video + overlay ─────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0 bg-neutral-950">
          <div className="flex-1 flex items-center justify-center p-3 min-h-0">
            <div className="relative h-full max-h-full aspect-[9/16] bg-black rounded-xl overflow-hidden w-full max-w-md">
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

              {/* Top overlay: seller info, viewer count */}
              <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none">
                <div className="flex items-center gap-2 bg-black/60 backdrop-blur rounded-full pl-1 pr-3 py-0.5 pointer-events-auto">
                  {stream.seller.avatarUrl ? (
                    <Image
                      src={stream.seller.avatarUrl}
                      alt=""
                      width={28}
                      height={28}
                      className="w-7 h-7 rounded-full"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                      {stream.seller.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="text-white">
                    <p className="text-xs font-semibold leading-none">{stream.seller.displayName}</p>
                    <p className="text-[10px] text-white/70 leading-none mt-0.5">@{stream.seller.username}</p>
                  </div>
                </div>
                {stream.status === "live" && (
                  <span className="inline-flex items-center gap-1 bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    LIVE · {viewerCount}
                  </span>
                )}
              </div>

              {/* Reveal mode theater overlay (renders on top of everything else, suppresses bid UI) */}
              <RevealOverlay reveal={activeReveal} randomizing={!!randomizing} />

              {/* Active auction overlay (hidden during reveal mode) */}
              {activeSpotInfo && !activeReveal && !randomizing && (
                <ActiveAuctionOverlay
                  breakItem={activeSpotInfo.breakItem}
                  spot={activeSpotInfo.spot}
                  socket={socket}
                  walletBalanceCents={user?.walletBalance ?? 0}
                  onTopUp={() => router.push("/wallet")}
                />
              )}
            </div>
          </div>

          {/* Title bar below video */}
          <div className="px-4 py-3 bg-white border-t border-border shrink-0">
            <h1 className="text-base font-bold truncate">{stream.title}</h1>
            <p className="text-xs text-muted-foreground">{stream.category}</p>
          </div>
        </main>

        {/* ── Right: Chat ─────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-80 border-l border-border bg-white min-h-0">
          {/* Wallet chip */}
          {user && (
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Your balance</span>
              <Link
                href="/wallet"
                className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
              >
                <Wallet className="h-3.5 w-3.5" />${(user.walletBalance / 100).toFixed(2)}
              </Link>
            </div>
          )}
          <div className="flex-1 min-h-0">
            <ChatPanel streamId={streamId} socket={socket} />
          </div>
        </aside>
      </div>

      <SpotsListModal
        open={!!openBreak}
        onClose={() => setOpenBreak(null)}
        break={openBreak}
        socket={socket}
        walletBalanceCents={user?.walletBalance ?? 0}
        onTopUp={() => router.push("/wallet")}
      />

      <SpinAnimation spin={activeSpin} onClose={dismissSpin} />
      <PersonalWinModal win={personalWin} onClose={dismissPersonalWin} />
      <ConfettiOverlay trigger={confettiTick} />
    </div>
  );
}
