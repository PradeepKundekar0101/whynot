"use client";

import { Component, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { Search, Wallet, Calendar, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, getAccessToken, API_ORIGIN } from "@/lib/api";
import { Navbar } from "@/components/layout/Navbar";
import { LiveStreamPlayer } from "@/components/stream/LiveStreamPlayer";
import { StreamRightPanel } from "@/components/stream/StreamRightPanel";
import { ConfettiOverlay } from "@/components/stream/ConfettiOverlay";
import { BreakCardCompact } from "@/components/stream/break/BreakCardCompact";
import { SpotsListModal } from "@/components/stream/break/SpotsListModal";
import { ActiveAuctionOverlay } from "@/components/stream/break/ActiveAuctionOverlay";
import { AutoRevealToast } from "@/components/stream/break/AutoRevealToast";
import { PostSaleBottomBar } from "@/components/stream/break/PostSaleBottomBar";
import { PersonalWinModal } from "@/components/stream/break/PersonalWinModal";
import { findActiveSpot, findLatestSoldSpot, useStreamBreaks } from "@/hooks/useStreamBreaks";
import type { Break } from "@/lib/break-types";
import { cn } from "@/lib/utils";

interface StreamData {
  id: string;
  title: string;
  category: string;
  status: string;
  scheduledStartAt: string | null;
  visibility?: string;
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

/** Bottom-rail tab on small screens to swap between Shop and the chat panel. */
const MOBILE_PANELS = [
  { id: "shop", label: "Shop" },
  { id: "panel", label: "Chat" },
] as const;
type MobilePanel = (typeof MOBILE_PANELS)[number]["id"];

/**
 * Isolates the LiveKit player so a runtime error inside the SDK (WebRTC,
 * track parsing, etc.) doesn't crash the entire stream page.
 */
class PlayerErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[stream player] crashed:", error);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function formatScheduledStart(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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
  const [viewerSessionId, setViewerSessionId] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("shop");

  const livekitUrl =
    process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://unacademy-7s3z9grv.livekit.cloud";

  const isLive = stream?.status === "live";
  const isScheduled = stream?.status === "scheduled";

  // Stable per-tab id (sessionStorage survives React Strict Mode remount double-invoke).
  useEffect(() => {
    const key = `whatnot:viewerSession:${streamId}`;
    let sid = sessionStorage.getItem(key);
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem(key, sid);
    }
    setViewerSessionId(sid);
  }, [streamId]);

  const {
    breaks,
    loading: breaksLoading,
    winToast,
    revealToast,
    personalWin,
    dismissPersonalWin,
    confettiTick,
    walletBalance,
  } = useStreamBreaks(streamId, socket, user?.id);

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

  // Bounce sellers viewing their own stream to the broadcaster page (works for
  // scheduled and live equally; broadcaster page handles both states).
  useEffect(() => {
    if (!user || !stream) return;
    if (user.id === stream.seller.id) {
      router.replace(`/seller/stream/${streamId}`);
    }
  }, [user, stream, router, streamId]);

  // Refresh user (for wallet balance) when server pushes wallet:balance_updated.
  useEffect(() => {
    if (walletBalance !== null) {
      void refreshUser();
    }
  }, [walletBalance, refreshUser]);

  // Join stream when user + stream loaded and the show is live. Scheduled shows
  // skip /join entirely — buyers can chat & inspect breaks ahead of time but
  // don't need a LiveKit token until the seller goes live.
  const userIdForJoin = user?.id ?? null;
  const streamStatusForJoin = stream?.status ?? null;
  useEffect(() => {
    if (!userIdForJoin || streamStatusForJoin !== "live" || viewerSessionId == null) return;

    const sidStream = streamId;
    const sid = viewerSessionId;
    let ignoreResult = false;

    void (async () => {
      try {
        const res = await apiFetch(`/streams/${sidStream}/join`, {
          method: "POST",
          body: JSON.stringify({ viewerSessionId: sid }),
        });
        if (!res.ok || ignoreResult) return;
        const data = await res.json();
        setToken(data.token);
        setViewerCount(data.viewerCount);
      } catch {}
    })();

    return () => {
      ignoreResult = true;
      void apiFetch(`/streams/${sidStream}/leave`, {
        method: "POST",
        body: JSON.stringify({ viewerSessionId: sid }),
      }).catch(() => {});
    };
  }, [userIdForJoin, streamStatusForJoin, streamId, viewerSessionId]);

  // Socket — wait for auth bootstrap so refresh has populated in-memory JWT.
  useEffect(() => {
    if (authLoading) return;

    const accessToken = getAccessToken();
    if (!accessToken || !stream) return;

    const s = io(API_ORIGIN, { auth: { token: accessToken } });
    s.on("connect", () => s.emit("stream:join", streamId));
    s.on("connect_error", (err) => {
      console.warn("[socket] connect_error:", err.message);
    });
    /* eslint-disable react-hooks/set-state-in-effect */
    setSocket(s);

    return () => {
      s.emit("stream:leave", streamId);
      s.disconnect();
      setSocket(null);
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [stream, streamId, authLoading]);

  useEffect(() => {
    if (!socket) return;
    const onCount = (p: { streamId: string; count: number }) => {
      if (p.streamId === streamId && typeof p.count === "number") setViewerCount(p.count);
    };
    socket.on("viewer:count", onCount);
    return () => {
      socket.off("viewer:count", onCount);
    };
  }, [socket, streamId]);

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

  // Pick the break that just had a sale to drive the bottom strip when no
  // auction is running. Falls back to the first in-progress break.
  const focusBreak =
    activeSpotInfo?.breakItem ??
    breaks.find((b) => b.status === "breaking") ??
    null;
  const latestSoldSpot = findLatestSoldSpot(focusBreak);
  const showPostSaleBar =
    !activeSpotInfo &&
    !!focusBreak &&
    !!latestSoldSpot &&
    focusBreak.status === "breaking";

  const playerSeller = useMemo(
    () =>
      stream
        ? {
            username: stream.seller.username,
            displayName: stream.seller.displayName,
            avatarUrl: stream.seller.avatarUrl,
          }
        : null,
    [stream?.seller.username, stream?.seller.displayName, stream?.seller.avatarUrl]
  );
  const handlePlayerDisconnected = useCallback(() => setToken(null), []);

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

  const scheduledLabel = formatScheduledStart(stream.scheduledStartAt);

  const shopPanel = (
    <ShopPanel
      search={search}
      onSearch={setSearch}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      breaks={filtered}
      breaksLoading={breaksLoading}
      activeSpotInfo={activeSpotInfo}
      onSeeSpots={(brk) => setOpenBreak(brk)}
    />
  );

  const rightPanel = (
    <StreamRightPanel
      streamId={streamId}
      socket={socket}
      variant="light"
      headerSlot={
        user ? (
          <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
            <span className="text-xs text-muted-foreground">Your balance</span>
            <Link
              href="/wallet"
              className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
            >
              <Wallet className="h-3.5 w-3.5" />${(user.walletBalance / 100).toFixed(2)}
            </Link>
          </div>
        ) : null
      }
    />
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar />

      <div className="flex flex-1 min-h-0 lg:flex-row flex-col">
        {/* ── Desktop: Left Shop sidebar ─────────────────── */}
        <aside className="hidden lg:flex flex-col w-72 xl:w-80 border-r border-border bg-white min-h-0 shrink-0">
          {shopPanel}
        </aside>

        {/* ── Center: Video + overlay ─────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-neutral-950">
          <div className="flex-1 flex items-center justify-center p-2 sm:p-3 min-h-0">
            <div className="relative h-full max-h-full aspect-[9/16] bg-black rounded-xl overflow-hidden w-full max-w-md">
              {isLive && token && playerSeller ? (
                <PlayerErrorBoundary
                  fallback={
                    <div className="flex flex-col items-center justify-center h-full bg-black text-white text-sm px-6 text-center gap-2">
                      <p className="font-medium">Something broke in the stream player.</p>
                      <button
                        type="button"
                        onClick={() => setToken(null)}
                        className="text-xs text-amber-300 underline"
                      >
                        Reload player
                      </button>
                    </div>
                  }
                >
                  <LiveStreamPlayer
                    token={token}
                    serverUrl={livekitUrl}
                    onDisconnected={handlePlayerDisconnected}
                    seller={playerSeller}
                  />
                </PlayerErrorBoundary>
              ) : isScheduled ? (
                <ScheduledPlaceholder
                  scheduledLabel={scheduledLabel}
                  sellerName={stream.seller.displayName}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-white text-sm px-6 text-center">
                  {isLive
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
                {isLive ? (
                  <span className="inline-flex items-center gap-1 bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    LIVE · {viewerCount}
                  </span>
                ) : isScheduled ? (
                  <span className="inline-flex items-center gap-1 bg-amber-500/90 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                    <Calendar className="h-3 w-3" />
                    Upcoming
                  </span>
                ) : null}
              </div>

              <AutoRevealToast winToast={winToast} revealToast={revealToast} />

              {activeSpotInfo ? (
                <ActiveAuctionOverlay
                  breakItem={activeSpotInfo.breakItem}
                  spot={activeSpotInfo.spot}
                  socket={socket}
                  walletBalanceCents={user?.walletBalance ?? 0}
                  onTopUp={() => router.push("/wallet")}
                />
              ) : showPostSaleBar ? (
                <PostSaleBottomBar breakItem={focusBreak} spot={latestSoldSpot} />
              ) : null}
            </div>
          </div>

          {/* Title bar below video */}
          <div className="px-4 py-3 bg-white border-t border-border shrink-0">
            <h1 className="text-base font-bold truncate">{stream.title}</h1>
            <p className="text-xs text-muted-foreground">
              {stream.category}
              {isScheduled && scheduledLabel ? ` · Starts ${scheduledLabel}` : ""}
            </p>
          </div>

          {/* Mobile/Tablet: tab strip + active panel */}
          <div className="lg:hidden flex flex-col flex-1 min-h-0 border-t border-border bg-white">
            <div className="flex shrink-0 border-b border-border">
              {MOBILE_PANELS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setMobilePanel(p.id)}
                  className={cn(
                    "flex-1 h-10 text-sm font-semibold transition-colors",
                    mobilePanel === p.id
                      ? "text-foreground border-b-2 border-primary -mb-px"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              {mobilePanel === "shop" ? (
                <div className="flex-1 min-h-0 flex flex-col">{shopPanel}</div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col">{rightPanel}</div>
              )}
            </div>
          </div>
        </main>

        {/* ── Desktop: Right panel ─────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-72 xl:w-80 border-l border-border bg-white min-h-0 shrink-0">
          {rightPanel}
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

      <PersonalWinModal win={personalWin} onClose={dismissPersonalWin} />
      <ConfettiOverlay trigger={confettiTick} />
    </div>
  );
}

function ScheduledPlaceholder({
  scheduledLabel,
  sellerName,
}: {
  scheduledLabel: string | null;
  sellerName: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gradient-to-b from-neutral-900 to-black text-white text-center px-6 gap-3">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 border border-primary/40">
        <Clock className="h-6 w-6 text-primary" />
      </div>
      <div>
        <p className="text-sm uppercase tracking-wider text-white/60">Upcoming show</p>
        {scheduledLabel ? (
          <p className="text-lg font-bold mt-1">{scheduledLabel}</p>
        ) : (
          <p className="text-lg font-bold mt-1">Starting soon</p>
        )}
      </div>
      <p className="text-xs text-white/60 max-w-xs leading-snug">
        {sellerName} hasn&rsquo;t gone live yet. Hang tight — chat is open and you can preview
        the breaks while you wait.
      </p>
    </div>
  );
}

function ShopPanel({
  search,
  onSearch,
  activeTab,
  onTabChange,
  breaks,
  breaksLoading,
  activeSpotInfo,
  onSeeSpots,
}: {
  search: string;
  onSearch: (s: string) => void;
  activeTab: BuyerTab;
  onTabChange: (t: BuyerTab) => void;
  breaks: Break[];
  breaksLoading: boolean;
  activeSpotInfo: { breakItem: Break } | null;
  onSeeSpots: (brk: Break) => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-4 pb-2 shrink-0">
        <h2 className="text-lg font-bold tracking-tight">Shop</h2>
      </div>

      <div className="px-4 pb-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search breaks..."
            className="w-full h-9 pl-8 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 px-4 pb-3 shrink-0">
        {BUYER_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
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

      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-3 min-h-0">
        {breaksLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : breaks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {activeTab === "sold" ? "No completed breaks yet." : "No breaks in this show yet."}
          </p>
        ) : (
          breaks.map((b) => (
            <BreakCardCompact
              key={b.id}
              break={b}
              active={activeSpotInfo?.breakItem.id === b.id}
              onSeeSpots={(brk) => onSeeSpots(brk)}
            />
          ))
        )}
      </div>
    </div>
  );
}
