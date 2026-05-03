"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { apiFetch } from "@/lib/api";
import type {
  AssignmentMode,
  Break,
  BreakCompletedEvent,
  BreakFinalRevealEvent,
  Spot,
  SpotAuctionEndedEvent,
  SpotAuctionStartedEvent,
  SpotBidPlacedEvent,
  SpotPurchasedEvent,
  SpotRevealedEvent,
  SpotSpinStartedEvent,
  SpotWonEvent,
} from "@/lib/break-types";

/**
 * Top-of-video win toast state. Set when `spot:won` arrives, cleared when
 * `spot:revealed` arrives (or after a fallback timeout if the reveal event
 * never lands).
 *
 * Carries the listing's reveal-config snapshot so the toast can branch:
 *   - autoRandomize=true                → expect spot:spin_started + spot:revealed
 *   - autoRandomize=false               → toast persists; show "awaiting spin"
 *   - assignmentMode=pick_your          → no reveal; clear quickly
 *   - assignmentMode=random_at_end      → no per-spot reveal; clear quickly
 */
export interface WinToast {
  spotId: string;
  listingId: string;
  spotNumber: number;
  winnerId: string;
  winnerUsername: string;
  winnerAvatarUrl: string | null;
  soldPrice: number;
  assignmentMode: AssignmentMode;
  autoRandomize: boolean;
  quickSpin: boolean;
}

/**
 * Spin-in-progress state — driven by `spot:spin_started`. Held until the
 * matching `spot:revealed` arrives, after which the reveal toast takes over.
 */
export interface ActiveSpin {
  spotId: string;
  listingId: string;
  spotNumber: number;
  candidates: string[];
  durationMs: number;
  startedAtMs: number;
}

/**
 * Reveal toast — replaces the win/spin overlay once the team is public.
 */
export interface RevealToast {
  spotId: string;
  listingId: string;
  spotNumber: number;
  winnerId: string;
  winnerUsername: string;
  winnerAvatarUrl: string | null;
  revealedTeam: string;
}

/** Personal "you got it!" modal that pops only for the winning user. */
export interface PersonalWin {
  spotId: string;
  spotNumber: number;
  revealedTeam: string;
}

function patchSpot(breaks: Break[], spotId: string, patch: Partial<Spot>): Break[] {
  return breaks.map((b) => ({
    ...b,
    spots: b.spots.map((s) => (s.id === spotId ? { ...s, ...patch } : s)),
  }));
}

function patchBreak(breaks: Break[], listingId: string, patch: Partial<Break>): Break[] {
  return breaks.map((b) => (b.id === listingId ? { ...b, ...patch } : b));
}

const REVEAL_TOAST_HOLD_MS = 5000;
/** No-reveal modes (pick_your / random_at_end) — auto-clear the win toast quickly. */
const SHORT_WIN_TOAST_MS = 3500;

/**
 * Subscribes to all break-related WebSocket events for a stream and keeps
 * a `breaks` array in sync. Drives every reveal-pipeline overlay.
 */
export function useStreamBreaks(
  streamId: string,
  socket: Socket | null,
  currentUserId?: string | null
) {
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [loading, setLoading] = useState(true);
  const [winToast, setWinToast] = useState<WinToast | null>(null);
  const [activeSpin, setActiveSpin] = useState<ActiveSpin | null>(null);
  const [revealToast, setRevealToast] = useState<RevealToast | null>(null);
  const [personalWin, setPersonalWin] = useState<PersonalWin | null>(null);
  // Confetti is a tick: incrementing it tells the overlay to re-fire.
  const [confettiTick, setConfettiTick] = useState(0);
  // Wallet balance updates pushed by the server.
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const userIdRef = useRef<string | null | undefined>(currentUserId);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    userIdRef.current = currentUserId;
  }, [currentUserId]);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch(`/breaks/stream/${streamId}`);
      if (res.ok) {
        const data = await res.json();
        setBreaks(data.breaks ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [streamId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!socket) return;

    const onCreated = (data: { listing: Break }) => {
      setBreaks((prev) => [data.listing, ...prev]);
    };

    const onStarted = (data: { listingId: string; startedAt?: string }) => {
      setBreaks((prev) =>
        patchBreak(prev, data.listingId, {
          status: "breaking",
          startedAt: data.startedAt ?? new Date().toISOString(),
        })
      );
    };

    const onAuctionStarted = (e: SpotAuctionStartedEvent) => {
      setBreaks((prev) =>
        patchSpot(prev, e.spotId, {
          auctionStatus: "active",
          auctionStartedAt: new Date().toISOString(),
          auctionEndsAt: e.endsAt,
          startingBid: e.startingBid,
          currentBid: null,
          bidCount: 0,
          highBidderId: null,
          highBidder: null,
          suddenDeath: e.suddenDeath,
          counterBidTime: e.counterBidTime,
          initialDuration: e.initialDuration,
        })
      );
    };

    const onBidPlaced = (e: SpotBidPlacedEvent) => {
      setBreaks((prev) =>
        patchSpot(prev, e.spotId, {
          currentBid: e.amount,
          highBidderId: e.bidderId,
          highBidder: {
            id: e.bidderId,
            username: e.bidderUsername,
            avatarUrl: e.bidderAvatarUrl,
          },
          bidCount: e.bidCount,
          auctionEndsAt: e.newEndsAt,
        })
      );
    };

    const onAuctionExtended = (e: { spotId: string; newEndsAt: string }) => {
      setBreaks((prev) => patchSpot(prev, e.spotId, { auctionEndsAt: e.newEndsAt }));
    };

    const onAuctionEnded = (e: SpotAuctionEndedEvent) => {
      setBreaks((prev) =>
        patchSpot(prev, e.spotId, {
          auctionStatus: "ended",
          winnerId: e.winnerId,
          winner: e.winnerId
            ? {
                id: e.winnerId,
                username: e.winnerUsername ?? "",
                avatarUrl: e.winnerAvatarUrl ?? null,
              }
            : null,
          soldPrice: e.soldPrice,
          soldAt: new Date().toISOString(),
        })
      );
    };

    const onPurchased = (e: SpotPurchasedEvent) => {
      setBreaks((prev) =>
        patchSpot(prev, e.spotId, {
          auctionStatus: "ended",
          winnerId: e.buyerId,
          winner: {
            id: e.buyerId,
            username: e.buyerUsername,
            avatarUrl: e.buyerAvatarUrl,
          },
          soldPrice: e.soldPrice,
          soldAt: new Date().toISOString(),
        })
      );
    };

    const onSkipped = (e: { spotId: string }) => {
      setBreaks((prev) => patchSpot(prev, e.spotId, { auctionStatus: "skipped" }));
    };

    const onConfetti = () => setConfettiTick((c) => c + 1);

    const onWallet = (e: { userId: string; newBalance: number }) => {
      setWalletBalance(e.newBalance);
    };

    // ── Reveal pipeline ───────────────────────────────────────────────

    const clearWinToastTimer = () => {
      if (winToastTimerRef.current) {
        clearTimeout(winToastTimerRef.current);
        winToastTimerRef.current = null;
      }
    };

    const onWon = (e: SpotWonEvent) => {
      setWinToast({
        spotId: e.spotId,
        listingId: e.listingId,
        spotNumber: e.spotNumber,
        winnerId: e.winnerId,
        winnerUsername: e.winnerUsername,
        winnerAvatarUrl: e.winnerAvatarUrl,
        soldPrice: e.soldPrice,
        assignmentMode: e.assignmentMode,
        autoRandomize: e.autoRandomize,
        quickSpin: e.quickSpin,
      });
      // Drop any previous spin/reveal — the new winner takes the spotlight.
      setRevealToast(null);
      setActiveSpin(null);
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }

      // For modes that have no per-spot reveal, the win toast is the whole
      // moment — auto-clear it quickly so the bottom bar takes over.
      clearWinToastTimer();
      const noPerSpotReveal =
        e.assignmentMode === "pick_your" || e.assignmentMode === "random_at_end";
      if (noPerSpotReveal) {
        winToastTimerRef.current = setTimeout(() => {
          setWinToast((cur) => (cur && cur.spotId === e.spotId ? null : cur));
          winToastTimerRef.current = null;
        }, SHORT_WIN_TOAST_MS);
      }
      // For autoRandomize modes the spin/reveal events will replace it.
      // For autoRandomize=false it persists until the seller spins.
    };

    const onSpinStarted = (e: SpotSpinStartedEvent) => {
      setActiveSpin({
        spotId: e.spotId,
        listingId: e.listingId,
        spotNumber: e.spotNumber,
        candidates: e.candidates,
        durationMs: e.durationMs,
        startedAtMs: Date.now(),
      });
    };

    const onRevealed = (e: SpotRevealedEvent) => {
      setBreaks((prev) =>
        patchSpot(prev, e.spotId, {
          isRevealedToBuyers: true,
          revealedTeam: e.revealedTeam,
          revealedAt: e.revealedAt,
        })
      );

      // Drop the win toast + spin overlay; surface the reveal toast.
      setWinToast(null);
      setActiveSpin(null);
      clearWinToastTimer();
      setRevealToast({
        spotId: e.spotId,
        listingId: e.listingId,
        spotNumber: e.spotNumber,
        winnerId: e.winnerId,
        winnerUsername: e.winnerUsername,
        winnerAvatarUrl: e.winnerAvatarUrl,
        revealedTeam: e.revealedTeam,
      });
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      revealTimerRef.current = setTimeout(() => {
        setRevealToast((cur) => (cur && cur.spotId === e.spotId ? null : cur));
        revealTimerRef.current = null;
      }, REVEAL_TOAST_HOLD_MS);

      if (userIdRef.current && e.winnerId === userIdRef.current) {
        setPersonalWin({
          spotId: e.spotId,
          spotNumber: e.spotNumber,
          revealedTeam: e.revealedTeam,
        });
      }
    };

    const onFinalReveal = (e: BreakFinalRevealEvent) => {
      // Apply every assignment in one state patch.
      setBreaks((prev) =>
        prev.map((b) => {
          if (b.id !== e.listingId) return b;
          const byId = new Map(e.assignments.map((a) => [a.spotId, a]));
          return {
            ...b,
            spots: b.spots.map((s) => {
              const a = byId.get(s.id);
              if (!a) return s;
              return {
                ...s,
                isRevealedToBuyers: true,
                revealedTeam: a.revealedTeam,
                revealedAt: new Date().toISOString(),
              };
            }),
          };
        })
      );
      // Personal win for the current user, if they're in this batch.
      const me = userIdRef.current;
      if (me) {
        const mine = e.assignments.find((a) => a.winnerId === me);
        if (mine) {
          setPersonalWin({
            spotId: mine.spotId,
            spotNumber: mine.spotNumber,
            revealedTeam: mine.revealedTeam,
          });
        }
      }
      setConfettiTick((c) => c + 1);
    };

    const onCompleted = (e: BreakCompletedEvent) => {
      setBreaks((prev) =>
        patchBreak(prev, e.listingId, {
          status: "completed",
          completedAt: new Date().toISOString(),
        })
      );
    };

    socket.on("break:created", onCreated);
    socket.on("break:started", onStarted);
    socket.on("break:completed", onCompleted);
    socket.on("break:final_reveal", onFinalReveal);
    socket.on("spot:auction_started", onAuctionStarted);
    socket.on("spot:bid_placed", onBidPlaced);
    socket.on("spot:auction_extended", onAuctionExtended);
    socket.on("spot:auction_ended", onAuctionEnded);
    socket.on("spot:purchased", onPurchased);
    socket.on("spot:skipped", onSkipped);
    socket.on("spot:won", onWon);
    socket.on("spot:spin_started", onSpinStarted);
    socket.on("spot:revealed", onRevealed);
    socket.on("confetti", onConfetti);
    socket.on("wallet:balance_updated", onWallet);

    return () => {
      socket.off("break:created", onCreated);
      socket.off("break:started", onStarted);
      socket.off("break:completed", onCompleted);
      socket.off("break:final_reveal", onFinalReveal);
      socket.off("spot:auction_started", onAuctionStarted);
      socket.off("spot:bid_placed", onBidPlaced);
      socket.off("spot:auction_extended", onAuctionExtended);
      socket.off("spot:auction_ended", onAuctionEnded);
      socket.off("spot:purchased", onPurchased);
      socket.off("spot:skipped", onSkipped);
      socket.off("spot:won", onWon);
      socket.off("spot:spin_started", onSpinStarted);
      socket.off("spot:revealed", onRevealed);
      socket.off("confetti", onConfetti);
      socket.off("wallet:balance_updated", onWallet);
    };
  }, [socket]);

  // Cleanup timers on unmount.
  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      if (winToastTimerRef.current) clearTimeout(winToastTimerRef.current);
    };
  }, []);

  return {
    breaks,
    loading,
    refresh,
    winToast,
    activeSpin,
    revealToast,
    personalWin,
    dismissPersonalWin: () => setPersonalWin(null),
    confettiTick,
    walletBalance,
  };
}

export function findActiveSpot(breaks: Break[]): { breakItem: Break; spot: Spot } | null {
  for (const b of breaks) {
    const active = b.spots.find((s) => s.auctionStatus === "active");
    if (active) return { breakItem: b, spot: active };
  }
  return null;
}

/**
 * Pick the most recently sold spot in a break (by soldAt). Used by the
 * bottom-of-video title overlay to show "Break Name - Team" once the auto
 * reveal has fired. Returns null if no spots are sold yet.
 */
export function findLatestSoldSpot(breakItem: Break | null | undefined): Spot | null {
  if (!breakItem) return null;
  let latest: Spot | null = null;
  for (const s of breakItem.spots) {
    if (!s.soldAt) continue;
    if (!latest || (s.soldAt ?? "") > (latest.soldAt ?? "")) latest = s;
  }
  return latest;
}

/**
 * Spots that are won but still hidden from buyers — used by the seller
 * control panel to render "Spin Now" cards in autoRandomize=false breaks.
 *
 * Excludes pick_your (born revealed) and random_at_end (assigned at completion).
 */
export function findPendingSpinSpots(breakItem: Break | null | undefined): Spot[] {
  if (!breakItem) return [];
  if (
    breakItem.assignmentMode === "pick_your" ||
    breakItem.assignmentMode === "random_at_end"
  ) {
    return [];
  }
  return breakItem.spots.filter((s) => s.winnerId && !s.isRevealedToBuyers);
}
