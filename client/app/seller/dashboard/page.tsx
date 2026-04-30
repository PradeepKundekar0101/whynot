"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  CalendarPlus,
  Radio,
  Pencil,
  Trash2,
  Clock,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { findCategory, findSubcategory } from "@/lib/show-categories";

interface Show {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  primaryCategory: string | null;
  primarySubcategory: string | null;
  category: string;
  status: string;
  scheduledStartAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  viewerCount: number;
}

interface SellerStats {
  totalShows: number;
  totalSalesCents: number;
  itemsSold: number;
}

const GO_LIVE_WINDOW_MS = 15 * 60 * 1000;

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function categoryLabel(show: Show): string {
  const cat = findCategory(show.primaryCategory ?? show.category);
  if (!cat) return show.primaryCategory ?? show.category ?? "Uncategorized";
  const sub = findSubcategory(cat.slug, show.primarySubcategory ?? undefined);
  return sub ? `${cat.label} → ${sub.label}` : cat.label;
}

function ShowCard({
  show,
  now,
  onCancel,
  onGoLive,
  onOpen,
  goLiveLoading,
  cancelLoading,
}: {
  show: Show;
  now: number;
  onCancel: (id: string) => Promise<void>;
  onGoLive: (id: string) => Promise<void>;
  onOpen: (id: string) => void;
  goLiveLoading: boolean;
  cancelLoading: boolean;
}) {
  const isLive = show.status === "live";
  const startMs = show.scheduledStartAt ? new Date(show.scheduledStartAt).getTime() : null;
  const canGoLive = isLive || (startMs !== null && startMs - now <= GO_LIVE_WINDOW_MS);
  const isFuture = !isLive && startMs !== null && startMs > now;
  const minutesUntil =
    startMs !== null ? Math.round((startMs - now) / 60000) : null;

  const goLiveTooltip = canGoLive
    ? undefined
    : minutesUntil !== null
      ? `Go Live unlocks 15 minutes before the show (in ~${minutesUntil} min)`
      : "Schedule a start time first";

  return (
    <div className="rounded-xl border border-border bg-white p-4 flex gap-4">
      <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-lg overflow-hidden bg-secondary">
        {show.thumbnailUrl ? (
          <Image
            src={show.thumbnailUrl}
            alt={show.title}
            fill
            className="object-cover"
            sizes="96px"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-xs text-muted-foreground">
            No image
          </div>
        )}
        {isLive && (
          <div className="absolute top-1 left-1 flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            <span className="w-1 h-1 bg-white rounded-full animate-pulse" />
            LIVE
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold truncate">{show.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {isLive ? `Live now (${show.viewerCount} viewers)` : formatDateTime(show.scheduledStartAt)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{categoryLabel(show)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => onGoLive(show.id)}
            disabled={!canGoLive || goLiveLoading}
            title={goLiveTooltip}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            <Radio className="h-3.5 w-3.5" />
            {goLiveLoading ? "Starting…" : isLive ? "Resume" : "Go Live"}
          </button>
          {isFuture && (
            <button
              type="button"
              onClick={() => onOpen(show.id)}
              title="Open the show now to pre-build breaks before going live"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border border-primary text-primary hover:bg-primary/5 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </button>
          )}
          {!isLive && (
            <>
              <button
                type="button"
                disabled
                title="Editing scheduled shows coming soon"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-border text-muted-foreground disabled:cursor-not-allowed"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => onCancel(show.id)}
                disabled={cancelLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-border text-destructive hover:bg-destructive/5 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {cancelLoading ? "Cancelling…" : "Cancel"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SellerDashboard() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [shows, setShows] = useState<Show[]>([]);
  const [showsLoading, setShowsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"go-live" | "cancel" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Re-evaluated every 30 seconds so the "Go Live" button enables when the show
  // crosses the 15-minute pre-start window without requiring a manual refresh.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const loadShows = useCallback(async () => {
    setShowsLoading(true);
    setLoadError(null);
    try {
      let upcomingRes: Response;
      let statsRes: Response;
      try {
        [upcomingRes, statsRes] = await Promise.all([
          apiFetch("/streams/upcoming"),
          apiFetch("/streams/seller/stats"),
        ]);
      } catch (e) {
        setShows([]);
        setStats(null);
        setLoadError(
          e instanceof Error ? e.message : "Network error — check API URL / connection."
        );
        return;
      }

      if (!upcomingRes.ok) {
        let msg = `Could not load shows (HTTP ${upcomingRes.status}).`;
        try {
          const err = await upcomingRes.json();
          if (err?.error?.message) msg = err.error.message;
        } catch {
          //
        }
        if (upcomingRes.status === 401) msg = "Session expired — please sign out and log in again.";
        setShows([]);
        setLoadError(msg);
      } else {
        const data = await upcomingRes.json();
        const list = Array.isArray(data.shows) ? data.shows : [];
        setShows(list);
      }

      if (statsRes.ok) {
        setStats(await statsRes.json());
      } else if (upcomingRes.ok) {
        let msg = `Could not load stats (HTTP ${statsRes.status}).`;
        try {
          const err = await statsRes.json();
          if (err?.error?.message) msg = err.error.message;
        } catch {
          //
        }
        setLoadError((prev) => (prev ? `${prev}\n${msg}` : msg));
      }
    } finally {
      setShowsLoading(false);
    }
  }, []);

  // Depend on stable scalar fields, not the `user` object reference, so a
  // re-fetched-but-equal user from auth context doesn't re-trigger this effect
  // (which would re-run loadShows in an infinite loop).
  const userId = user?.id ?? null;
  const isSellerEnabled = user?.isSellerEnabled ?? false;

  useEffect(() => {
    if (isLoading) return;
    if (!userId) {
      router.push("/login");
      return;
    }
    if (!isSellerEnabled) {
      router.push("/");
      return;
    }
    void loadShows();

    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void loadShows();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [userId, isSellerEnabled, isLoading, router, loadShows]);

  useEffect(() => {
    const handler = () => {
      void loadShows();
    };
    if (typeof window === "undefined") return;
    window.addEventListener("whatnot:seller-dashboard-refresh", handler);
    return () => window.removeEventListener("whatnot:seller-dashboard-refresh", handler);
  }, [loadShows]);

  const handleCancel = async (showId: string) => {
    if (!confirm("Cancel this scheduled show?")) return;
    setPendingId(showId);
    setPendingAction("cancel");
    setActionError(null);
    try {
      const res = await apiFetch(`/streams/${showId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data?.error?.message || "Failed to cancel show.");
        return;
      }
      await loadShows();
    } finally {
      setPendingId(null);
      setPendingAction(null);
    }
  };

  const handleGoLive = async (showId: string) => {
    setPendingId(showId);
    setPendingAction("go-live");
    setActionError(null);
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
          setActionError(
            err instanceof Error
              ? err.message
              : "Could not access camera or microphone."
          );
          return;
        }
      }

      const res = await apiFetch(`/streams/${showId}/go-live`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data?.error?.message || "Failed to start show.");
        return;
      }
      router.push(`/seller/stream/${showId}`);
    } finally {
      setPendingId(null);
      setPendingAction(null);
    }
  };

  if (isLoading || !user) return null;

  return (
    <div className="flex flex-col min-h-screen bg-[#FAFAFA]">
      <Navbar />
      <main className="flex-1 max-w-5xl mx-auto w-full p-6">
        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Seller Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Welcome back, @{user.username}
            </p>
          </div>
          <Link
            href="/seller/schedule"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <CalendarPlus className="h-4 w-4" />
            Schedule a Show
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          <div className="rounded-xl border border-border bg-white p-4 text-center">
            <p className="text-2xl font-bold">{stats?.totalShows ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Total Shows</p>
          </div>
          <div className="rounded-xl border border-border bg-white p-4 text-center">
            <p className="text-2xl font-bold">
              {stats ? formatCurrency(stats.totalSalesCents) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Total Sales</p>
          </div>
          <div className="rounded-xl border border-border bg-white p-4 text-center">
            <p className="text-2xl font-bold">{stats?.itemsSold ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Items Sold</p>
          </div>
        </div>

        {loadError && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span className="text-foreground">{loadError}</span>
            <button
              type="button"
              onClick={() => void loadShows()}
              className="shrink-0 px-4 py-2 rounded-lg bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              Try again
            </button>
          </div>
        )}

        {actionError && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-px shrink-0" />
            {actionError}
          </div>
        )}

        {/* Upcoming Shows */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Upcoming Shows</h2>
          {showsLoading ? (
            <div className="rounded-xl border border-border bg-white p-6 text-sm text-muted-foreground">
              Loading shows…
            </div>
          ) : shows.length === 0 && loadError ? (
            <div className="rounded-xl border border-border bg-white p-8 text-center text-sm text-muted-foreground">
              Shows could not be loaded. Use <strong className="text-foreground">Try again</strong> above.
            </div>
          ) : shows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-white p-8 text-center">
              <p className="font-medium mb-1">No upcoming shows yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Schedule your first show to start selling.
              </p>
              <Link
                href="/seller/schedule"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <CalendarPlus className="h-4 w-4" />
                Schedule a Show
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {shows.map((s) => (
                <ShowCard
                  key={s.id}
                  show={s}
                  now={now}
                  onCancel={handleCancel}
                  onGoLive={handleGoLive}
                  onOpen={(id) => router.push(`/seller/stream/${id}`)}
                  goLiveLoading={pendingId === s.id && pendingAction === "go-live"}
                  cancelLoading={pendingId === s.id && pendingAction === "cancel"}
                />
              ))}
            </div>
          )}
        </section>

        {/* Recent activity placeholder */}
        <section className="rounded-xl border border-border bg-white p-6">
          <h2 className="text-lg font-semibold mb-2">Recent Activity</h2>
          <p className="text-sm text-muted-foreground">
            Past show stats and sales will appear here once you&rsquo;ve completed some shows.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
