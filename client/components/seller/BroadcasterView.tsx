"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import {
  LiveKitRoom,
  VideoTrack,
  useLocalParticipant,
  useConnectionState,
} from "@livekit/components-react";
import { Track, ConnectionState } from "livekit-client";
import "@livekit/components-styles";
import {
  Plus,
  Search,
  Copy,
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Share2,
  Trash2,
  ChevronRight,
  Check,
  ArrowLeft,
  Clock,
  Radio,
  CalendarClock,
} from "lucide-react";
import { apiFetch, getAccessToken, API_ORIGIN } from "@/lib/api";
import { StreamRightPanel } from "@/components/stream/StreamRightPanel";
import { CameraOffPlaceholder } from "@/components/stream/CameraOffPlaceholder";
import { ConfettiOverlay } from "@/components/stream/ConfettiOverlay";
import { SpinAnimation } from "@/components/stream/break/SpinAnimation";
import { BreakCreationModal } from "@/components/seller/break/BreakCreationModal";
import { BreakControlPanel } from "@/components/seller/break/BreakControlPanel";
import { RevealModePanel } from "@/components/seller/break/RevealModePanel";
import { RevealOverlay } from "@/components/stream/break/RevealOverlay";
import { useStreamBreaks } from "@/hooks/useStreamBreaks";
import { useStreamStats } from "@/hooks/useStreamStats";
import { useAuth } from "@/hooks/useAuth";
import type { Break } from "@/lib/break-types";
import { formatCents } from "@/lib/break-format";
import { cn } from "@/lib/utils";

interface BroadcasterViewProps {
  streamId: string;
  /** null when the show is still scheduled (not live yet). */
  token: string | null;
  title: string;
  /** "live" | "scheduled" — controls whether the LiveKit room is mounted. */
  status?: string;
  scheduledStartAt?: string | null;
}

const GO_LIVE_WINDOW_MS = 15 * 60 * 1000;

function formatScheduled(iso: string | null | undefined) {
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

const MOBILE_RAIL_TABS = [
  { id: "shop", label: "Shop" },
  { id: "stats", label: "Stats & Chat" },
] as const;
type MobileRail = (typeof MOBILE_RAIL_TABS)[number]["id"];

const TABS = [
  { id: "offers", label: "Offers", enabled: false },
  { id: "auction", label: "Auction", enabled: true },
  { id: "giveaways", label: "Giveaways", enabled: false },
  { id: "buynow", label: "Buy Now", enabled: false },
  { id: "sold", label: "Sold", enabled: true },
  { id: "tips", label: "Tips", enabled: false },
] as const;

type TabId = (typeof TABS)[number]["id"];

function BroadcasterVideo({ liveKitError }: { liveKitError: string | null }) {
  const { user } = useAuth();
  const connectionState = useConnectionState();
  const {
    localParticipant,
    cameraTrack,
    lastCameraError,
    isCameraEnabled,
    isMicrophoneEnabled,
  } = useLocalParticipant();

  if (liveKitError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full bg-black text-red-400 text-sm px-6 text-center">
        <p className="font-medium text-white">LiveKit connection failed</p>
        <p>{liveKitError}</p>
      </div>
    );
  }

  if (
    connectionState === ConnectionState.Connecting ||
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting
  ) {
    return (
      <div className="flex items-center justify-center h-full bg-black text-white text-sm">
        Connecting to stream...
      </div>
    );
  }

  if (lastCameraError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full bg-black text-amber-400 text-sm px-6 text-center">
        <p className="font-medium text-white">Camera / microphone</p>
        <p>{lastCameraError.message}</p>
      </div>
    );
  }

  // Seller intentionally turned the camera off. Show a friendly self-directed
  // placeholder so they remember the camera is paused.
  if (!isCameraEnabled) {
    return (
      <CameraOffPlaceholder
        variant="seller"
        displayName={user?.displayName ?? user?.username ?? "You"}
        username={user?.username ?? null}
        avatarUrl={user?.avatarUrl ?? null}
        micOn={isMicrophoneEnabled}
      />
    );
  }

  if (!cameraTrack?.track) {
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

/**
 * Floating broadcaster controls overlaid on the video preview. Lives INSIDE
 * `<LiveKitRoom>` so it can use `useLocalParticipant` to actually toggle
 * publishing of the local mic / camera tracks.
 */
function BroadcasterControls({ buyerUrl }: { buyerUrl: string }) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const [busy, setBusy] = useState<"mic" | "camera" | null>(null);
  const [shareState, setShareState] = useState<"idle" | "copied" | "error">("idle");
  const [mediaError, setMediaError] = useState<string | null>(null);

  const toggleMic = async () => {
    if (!localParticipant || busy === "mic") return;
    setBusy("mic");
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
      setMediaError(null);
    } catch (e) {
      console.error(e);
      setMediaError(e instanceof Error ? e.message : "Could not toggle microphone.");
    } finally {
      setBusy(null);
    }
  };

  const toggleCamera = async () => {
    if (!localParticipant || busy === "camera") return;
    setBusy("camera");
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
      setMediaError(null);
    } catch (e) {
      console.error(e);
      setMediaError(e instanceof Error ? e.message : "Could not toggle camera.");
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    if (!buyerUrl) return;
    // Prefer the native share sheet on mobile; fall back to clipboard on desktop.
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Watch my live show", url: buyerUrl });
        setShareState("copied");
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(buyerUrl);
        setShareState("copied");
      } else {
        throw new Error("clipboard unavailable");
      }
    } catch {
      // User dismissed the share sheet OR clipboard blocked.
      setShareState("error");
    } finally {
      setTimeout(() => setShareState("idle"), 1800);
    }
  };

  return (
    <div className="absolute bottom-3 right-3 z-20 flex flex-col items-end gap-2 pointer-events-auto">
      {mediaError && (
        <p
          role="alert"
          className="max-w-[14rem] rounded-lg bg-black/80 border border-white/15 text-amber-200 text-[11px] leading-snug px-2 py-1.5"
        >
          {mediaError}
        </p>
      )}
      <ControlButton
        onClick={toggleMic}
        disabled={busy === "mic"}
        active={!isMicrophoneEnabled}
        title={isMicrophoneEnabled ? "Mute microphone — buyers won't hear you" : "Unmute microphone"}
        icon={isMicrophoneEnabled ? <Mic className="h-4 w-4 shrink-0" /> : <MicOff className="h-4 w-4 shrink-0" />}
        caption={isMicrophoneEnabled ? "Mute" : "Unmute"}
      />
      <ControlButton
        onClick={toggleCamera}
        disabled={busy === "camera"}
        active={!isCameraEnabled}
        title={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
        icon={
          isCameraEnabled ? (
            <VideoIcon className="h-4 w-4 shrink-0" />
          ) : (
            <VideoOff className="h-4 w-4 shrink-0" />
          )
        }
        caption={isCameraEnabled ? "Cam off" : "Cam on"}
      />
      <ControlButton
        onClick={share}
        title={
          shareState === "copied"
            ? "Buyer link copied"
            : shareState === "error"
              ? "Couldn't copy"
              : "Share buyer link"
        }
        icon={
          shareState === "copied" ? (
            <Check className="h-4 w-4 shrink-0" />
          ) : (
            <Share2 className="h-4 w-4 shrink-0" />
          )
        }
        flash={shareState !== "idle"}
        caption="Share"
      />
    </div>
  );
}

function ControlButton({
  onClick,
  disabled,
  active,
  label,
  title,
  icon,
  flash,
  caption,
}: {
  onClick: () => void;
  disabled?: boolean;
  /** @deprecated Prefer `title` for tooltip (matches native `title` attr). */
  label?: string;
  title?: string;
  /** When true, button shows a "destructive/active" state (e.g. mic muted). */
  active?: boolean;
  icon: React.ReactNode;
  flash?: boolean;
  /** Short label shown beside the icon (e.g. "Mute"). */
  caption?: string;
}) {
  const tip = title ?? label;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tip}
      aria-label={tip}
      className={cn(
        "inline-flex items-center gap-2 pl-2.5 pr-3 py-2 rounded-full transition-colors text-white shadow-lg",
        active
          ? "bg-red-500 hover:bg-red-600"
          : flash
            ? "bg-green-500 hover:bg-green-600"
            : "bg-black/70 hover:bg-black/85 border border-white/10",
        disabled && "opacity-60 cursor-not-allowed"
      )}
    >
      {icon}
      {caption && <span className="text-xs font-semibold leading-none">{caption}</span>}
    </button>
  );
}

export function BroadcasterView({
  streamId,
  token,
  title,
  status = "live",
  scheduledStartAt = null,
}: BroadcasterViewProps) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [liveKitError, setLiveKitError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("auction");
  const [createBreakOpen, setCreateBreakOpen] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [expandedBreakId, setExpandedBreakId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [mobileRail, setMobileRail] = useState<MobileRail>("shop");
  const [goLivePending, setGoLivePending] = useState(false);
  const [goLiveError, setGoLiveError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const livekitUrl =
    process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://unacademy-7s3z9grv.livekit.cloud";

  const isLive = status === "live" && !!token;
  const isScheduled = status === "scheduled";
  const startMs = scheduledStartAt ? new Date(scheduledStartAt).getTime() : null;
  const minutesUntilStart =
    startMs !== null ? Math.max(0, Math.round((startMs - now) / 60000)) : null;
  const canGoLive =
    isScheduled && startMs !== null && startMs - now <= GO_LIVE_WINDOW_MS;
  const scheduledLabel = formatScheduled(scheduledStartAt);

  // Re-evaluate every 30s so the Go Live button flips on automatically when we
  // cross the 15-minute window without making the seller refresh the page.
  useEffect(() => {
    if (!isScheduled) return;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [isScheduled]);

  const {
    breaks,
    refresh,
    activeSpin,
    dismissSpin,
    activeReveal,
    randomizing,
    confettiTick,
  } = useStreamBreaks(streamId, socket, user?.id);
  const stats = useStreamStats(streamId, socket);

  // Socket.IO connection — `setSocket` here is required to publish the live
  // socket reference to subscribers. This is the canonical "connect to external
  // system" pattern from the React docs.
  useEffect(() => {
    if (authLoading) return;

    const accessToken = getAccessToken();
    if (!accessToken) return;
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
  }, [streamId, authLoading]);

  // Cross-component handoff: the completion summary fires this event when the
  // seller clicks "Create Another Break".
  useEffect(() => {
    const open = () => setCreateBreakOpen(true);
    window.addEventListener("seller:open-create-break", open);
    return () => window.removeEventListener("seller:open-create-break", open);
  }, []);

  const buyerUrl = typeof window !== "undefined" ? `${window.location.origin}/stream/${streamId}` : "";

  const handleCopyUrl = async () => {
    if (!buyerUrl) return;
    try {
      await navigator.clipboard.writeText(buyerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleEndStream = async () => {
    if (!confirm("End the show now?")) return;
    try {
      await apiFetch(`/streams/${streamId}/end`, { method: "POST" });
    } catch {}
    router.push("/seller/dashboard");
  };

  const handleGoLive = async () => {
    setGoLiveError(null);
    setGoLivePending(true);
    try {
      // Warm camera/mic permissions while we still have the user gesture.
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        try {
          const warmup = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          warmup.getTracks().forEach((t) => t.stop());
        } catch (err) {
          setGoLiveError(
            err instanceof Error
              ? err.message
              : "Could not access camera or microphone."
          );
          return;
        }
      }
      const res = await apiFetch(`/streams/${streamId}/go-live`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGoLiveError(data?.error?.message || "Failed to start show.");
        return;
      }
      // Reload to pick up the freshly-minted publisher token + LiveKit room.
      window.location.reload();
    } finally {
      setGoLivePending(false);
    }
  };

  // Auto-expand first break with active auction or filling state.
  // We derive "should auto-expand" from the data without an effect: if no
  // break is expanded yet but breaks exist, default to the first interesting one.
  const autoExpandedBreakId = useMemo(() => {
    if (expandedBreakId) return expandedBreakId;
    if (breaks.length === 0) return null;
    const focus = breaks.find((b) => b.status === "breaking") ?? breaks[0];
    return focus.id;
  }, [expandedBreakId, breaks]);

  const auctionBreaks = useMemo(
    () => breaks.filter((b) => b.status !== "completed" && b.status !== "cancelled"),
    [breaks]
  );
  const soldBreaks = useMemo(
    () => breaks.filter((b) => b.status === "completed"),
    [breaks]
  );

  const tabCounts: Record<TabId, number> = {
    offers: 0,
    auction: auctionBreaks.length,
    giveaways: 0,
    buynow: 0,
    sold: soldBreaks.length,
    tips: 0,
  };

  const filteredBreaks = useMemo(() => {
    const list = activeTab === "sold" ? soldBreaks : auctionBreaks;
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((b) => b.breakName.toLowerCase().includes(q));
  }, [activeTab, soldBreaks, auctionBreaks, search]);

  const expandedBreak = breaks.find((b) => b.id === autoExpandedBreakId) ?? null;

  const shopPanel = (
    <ShopPanel
      title={title}
      tabs={TABS}
      tabCounts={tabCounts}
      activeTab={activeTab}
      onTabChange={(t) => setActiveTab(t as TabId)}
      search={search}
      onSearch={setSearch}
      breaks={filteredBreaks}
      activeBreakId={autoExpandedBreakId}
      onToggleBreak={(id) =>
        setExpandedBreakId((prev) => (prev === id ? null : id))
      }
      onAddProduct={() => setAddProductOpen(true)}
    />
  );

  const rightPanel = (
    <StreamRightPanel
      streamId={streamId}
      socket={socket}
      variant="dark"
      headerSlot={
        <div className="p-4 border-b border-white/10 shrink-0">
          <p className="text-xs text-white/50">Show Stats</p>
          <div className="mt-2 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-lg bg-white/5 p-3">
              <p className="text-lg font-bold text-primary">
                {formatCents(stats.totalSalesCents)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-white/40">Sales</p>
            </div>
            <div className="rounded-lg bg-white/5 p-3">
              <p className="text-lg font-bold text-white">{stats.uniqueBuyers}</p>
              <p className="text-[10px] uppercase tracking-wider text-white/40">Buyers</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-center text-white/40">
            Est. payout {formatCents(stats.estimatedPayoutCents)} · {stats.spotsSold} spots sold
          </p>
        </div>
      }
    />
  );

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0A] text-white overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-3 sm:px-4 h-12 bg-[#0A0A0A] border-b border-white/10 shrink-0 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => router.push("/seller/dashboard")}
            className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-white/10 transition-colors shrink-0 lg:hidden"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {isLive ? (
            <span className="flex items-center gap-1 bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              LIVE
            </span>
          ) : (
            <span className="flex items-center gap-1 bg-amber-500/90 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0">
              <CalendarClock className="h-3 w-3" />
              SCHEDULED
            </span>
          )}
          <span className="text-sm font-semibold truncate">{title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopyUrl}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            title={buyerUrl}
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied!" : "Copy buyer link"}
          </button>
          <button
            onClick={handleCopyUrl}
            className="sm:hidden inline-flex items-center justify-center h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            title="Copy buyer link"
            aria-label="Copy buyer link"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
          {isLive ? (
            <button
              onClick={handleEndStream}
              className="px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              End
            </button>
          ) : (
            <button
              type="button"
              disabled={!canGoLive || goLivePending}
              onClick={handleGoLive}
              title={
                canGoLive
                  ? undefined
                  : minutesUntilStart !== null
                    ? `Go Live unlocks 15 minutes before start (in ~${minutesUntilStart} min)`
                    : "Schedule a start time first"
              }
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-full bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
            >
              <Radio className="h-3.5 w-3.5" />
              {goLivePending ? "Starting…" : "Go Live"}
            </button>
          )}
        </div>
      </header>

      {goLiveError && (
        <div className="px-4 py-2 text-xs bg-red-500/15 text-red-300 border-b border-red-500/30 shrink-0">
          {goLiveError}
        </div>
      )}

      <div className="flex flex-1 min-h-0 lg:flex-row flex-col">
        {/* ── Desktop: Left Shop sidebar ───────────────────── */}
        <aside className="hidden lg:flex w-64 xl:w-72 border-r border-white/10 bg-[#0F0F0F] flex-col min-h-0 shrink-0">
          {shopPanel}
        </aside>

        {/* ── Center column: video + (when a break is expanded) its control panel ───── */}
        <main className="flex-1 flex min-w-0 min-h-0 flex-col md:flex-row">
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-black">
            <div className="flex-1 flex items-center justify-center p-2 sm:p-3 min-h-0">
              <div className="relative h-full max-h-full aspect-[9/16] bg-black rounded-xl overflow-hidden w-full max-w-md">
                {isLive && token ? (
                  <LiveKitRoom
                    token={token}
                    serverUrl={livekitUrl}
                    connect={true}
                    video={true}
                    audio={true}
                    className="w-full h-full"
                    onError={(err) => setLiveKitError(err.message)}
                  >
                    <BroadcasterVideo liveKitError={liveKitError} />
                    <BroadcasterControls buyerUrl={buyerUrl} />
                  </LiveKitRoom>
                ) : (
                  <ScheduledBroadcasterPlaceholder
                    scheduledLabel={scheduledLabel}
                    minutesUntilStart={minutesUntilStart}
                  />
                )}

                <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                  <span className="inline-flex items-center gap-1 bg-black/60 text-white text-[11px] font-medium px-2 py-1 rounded-full">
                    {isLive ? "Private link" : "Preview"}
                  </span>
                </div>

                <RevealOverlay reveal={activeReveal} randomizing={!!randomizing} />
              </div>
            </div>

            {/* Mobile/Tablet: bottom rail to swap between Shop / Stats+Chat */}
            <div className="lg:hidden flex flex-col flex-1 min-h-0 border-t border-white/10 bg-[#0F0F0F]">
              <div className="flex shrink-0 border-b border-white/10">
                {MOBILE_RAIL_TABS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setMobileRail(p.id)}
                    className={cn(
                      "flex-1 h-10 text-xs font-semibold transition-colors uppercase tracking-wider",
                      mobileRail === p.id
                        ? "text-white border-b-2 border-primary -mb-px"
                        : "text-white/50 hover:text-white"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                {mobileRail === "shop" ? shopPanel : rightPanel}
              </div>
            </div>
          </div>

          {/* Break control panel — visible md+ when a break is expanded */}
          {expandedBreak && (
            <aside className="hidden md:flex w-72 xl:w-80 border-t md:border-t-0 md:border-l border-white/10 bg-[#0F0F0F] flex-col min-w-0 shrink-0">
              {expandedBreak.status === "revealing" ||
              expandedBreak.status === "randomizing" ||
              expandedBreak.status === "completed" ? (
                <RevealModePanel break={expandedBreak} socket={socket} />
              ) : (
                <BreakControlPanel break={expandedBreak} socket={socket} />
              )}
            </aside>
          )}
        </main>

        {/* ── Desktop: Right column: stats + 3-tab chat panel ───── */}
        <aside className="hidden lg:flex w-72 xl:w-80 border-l border-white/10 bg-[#0F0F0F] flex-col min-h-0 shrink-0">
          {rightPanel}
        </aside>
      </div>

      {/* Modals */}
      <AddProductMenu
        open={addProductOpen}
        onClose={() => setAddProductOpen(false)}
        onCreateBreak={() => {
          setAddProductOpen(false);
          setCreateBreakOpen(true);
        }}
      />

      <BreakCreationModal
        open={createBreakOpen}
        onClose={() => setCreateBreakOpen(false)}
        streamId={streamId}
        onCreated={() => void refresh()}
      />

      <SpinAnimation spin={activeSpin} onClose={dismissSpin} />
      <ConfettiOverlay trigger={confettiTick} />
    </div>
  );
}

function ScheduledBroadcasterPlaceholder({
  scheduledLabel,
  minutesUntilStart,
}: {
  scheduledLabel: string | null;
  minutesUntilStart: number | null;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gradient-to-b from-neutral-900 to-black text-white text-center px-6 gap-3">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 border border-primary/40">
        <Clock className="h-6 w-6 text-primary" />
      </div>
      <p className="text-xs uppercase tracking-wider text-white/50">Show preview</p>
      {scheduledLabel ? (
        <p className="text-base font-bold">{scheduledLabel}</p>
      ) : (
        <p className="text-base font-bold">Starting soon</p>
      )}
      <p className="text-xs text-white/60 max-w-[18rem] leading-snug">
        Your camera connects when you click <span className="text-primary font-semibold">Go Live</span>.
        In the meantime you can pre-build breaks using the Shop panel.
      </p>
      {minutesUntilStart !== null && minutesUntilStart > 15 && (
        <p className="text-[11px] text-white/40">
          Go Live unlocks 15 minutes before start (~{minutesUntilStart} min remaining).
        </p>
      )}
    </div>
  );
}

function ShopPanel({
  title,
  tabs,
  tabCounts,
  activeTab,
  onTabChange,
  search,
  onSearch,
  breaks,
  activeBreakId,
  onToggleBreak,
  onAddProduct,
}: {
  title: string;
  tabs: typeof TABS;
  tabCounts: Record<TabId, number>;
  activeTab: TabId;
  onTabChange: (id: string) => void;
  search: string;
  onSearch: (s: string) => void;
  breaks: Break[];
  activeBreakId: string | null;
  onToggleBreak: (id: string) => void;
  onAddProduct: () => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 border-b border-white/10 shrink-0">
        <p className="text-xs uppercase tracking-wider text-white/40 mb-2">Show</p>
        <p className="text-sm font-semibold truncate">{title}</p>
      </div>

      <div className="flex flex-col border-b border-white/10 shrink-0">
        {tabs.map((tab) => {
          const count = tabCounts[tab.id];
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => tab.enabled && onTabChange(tab.id)}
              disabled={!tab.enabled}
              title={tab.enabled ? undefined : "Coming soon"}
              className={cn(
                "flex items-center justify-between px-3 py-2 text-sm transition-colors text-left",
                active && "bg-primary/10 text-white border-l-2 border-primary -ml-px",
                !active && tab.enabled && "text-white/70 hover:bg-white/5",
                !tab.enabled && "text-white/30 cursor-not-allowed"
              )}
            >
              <span className="flex items-center gap-2">
                {tab.label}
                {active && <span className="w-1.5 h-1.5 bg-primary rounded-full" />}
              </span>
              {count > 0 && <span className="text-xs text-white/40">({count})</span>}
            </button>
          );
        })}
      </div>

      <div className="p-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search breaks..."
            className="w-full h-9 pl-8 pr-3 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="px-3 pb-3 shrink-0">
        <button
          type="button"
          disabled
          title="Pre-bids — coming soon"
          className="w-full inline-flex items-center justify-between gap-1.5 h-9 px-3 rounded-lg border border-white/10 text-xs font-medium text-white/40 cursor-not-allowed"
        >
          Pre-bids
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-px rounded bg-white/10">Soon</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {breaks.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-white/40 mb-2">
              {activeTab === "sold" ? "No completed breaks yet." : "No breaks yet."}
            </p>
            {activeTab === "auction" && (
              <p className="text-xs text-white/30">
                Click <span className="text-primary">Add a Product</span> to create one.
              </p>
            )}
          </div>
        ) : (
          breaks.map((b) => (
            <BreakSummaryCard
              key={b.id}
              break={b}
              expanded={activeBreakId === b.id}
              onToggle={() => onToggleBreak(b.id)}
            />
          ))
        )}
      </div>

      <div className="p-3 border-t border-white/10 shrink-0">
        <button
          type="button"
          onClick={onAddProduct}
          className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add a Product
        </button>
      </div>
    </div>
  );
}



function BreakSummaryCard({
  break: brk,
  expanded,
  onToggle,
}: {
  break: Break;
  expanded: boolean;
  onToggle: () => void;
}) {
  const sold = brk.spots.filter((s) => s.winnerId).length;
  const total = brk.spots.length;
  const active = brk.spots.find((s) => s.auctionStatus === "active");

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition-colors",
        expanded && "bg-primary/5 border-l-2 border-l-primary -ml-px"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-white/40">
            {brk.breakFormat === "random" ? "Random Team" : "Pick Your Team"} ·{" "}
            {brk.sellingMode === "auction" ? "Auction" : "Buy It Now"}
          </p>
          <p className="text-sm font-semibold truncate">{brk.breakName}</p>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={cn(
                "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                brk.status === "filling" && "bg-amber-500/20 text-amber-300",
                brk.status === "breaking" && "bg-red-500/20 text-red-300",
                brk.status === "completed" && "bg-green-500/20 text-green-300"
              )}
            >
              {brk.status === "filling" ? "Filling" : brk.status === "breaking" ? "Live" : "Done"}
            </span>
            <span className="text-[11px] text-white/50">{sold}/{total} sold</span>
            {active && (
              <span className="text-[10px] text-red-300 inline-flex items-center gap-1">
                <span className="w-1 h-1 bg-red-500 rounded-full animate-pulse" />
                Auctioning
              </span>
            )}
          </div>
        </div>
        <ChevronRight
          className={cn(
            "h-4 w-4 text-white/30 transition-transform shrink-0",
            expanded && "rotate-90"
          )}
        />
      </div>
    </button>
  );
}

function AddProductMenu({
  open,
  onClose,
  onCreateBreak,
}: {
  open: boolean;
  onClose: () => void;
  onCreateBreak: () => void;
}) {
  if (!open) return null;
  const items = [
    { id: "temp", label: "Create Temporary Listing", description: "Quick one-off sale", enabled: false },
    { id: "quality", label: "Create Quality Listing", description: "Reusable product details", enabled: false },
    { id: "inventory", label: "Import from Inventory", description: "From your saved inventory", enabled: false },
    {
      id: "break",
      label: "Create a Break",
      description: "Box / case break with multiple spots",
      enabled: true,
      badge: "Beta",
    },
  ];
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-neutral-900 border border-white/10 p-2 text-white shadow-2xl">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (!item.enabled) return;
              if (item.id === "break") onCreateBreak();
            }}
            disabled={!item.enabled}
            title={item.enabled ? undefined : "Coming soon"}
            className={cn(
              "w-full text-left rounded-xl px-4 py-3 flex items-start justify-between gap-3 transition-colors",
              item.enabled ? "hover:bg-white/5" : "opacity-40 cursor-not-allowed"
            )}
          >
            <div>
              <p className="text-sm font-semibold flex items-center gap-2">
                {item.label}
                {item.badge && (
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                    {item.badge}
                  </span>
                )}
              </p>
              <p className="text-xs text-white/50">{item.description}</p>
            </div>
            {item.enabled && <ChevronRight className="h-4 w-4 text-white/40 mt-1" />}
            {!item.enabled && <Trash2 className="h-4 w-4 text-white/20 mt-1 opacity-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}
