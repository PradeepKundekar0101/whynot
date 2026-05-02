"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { apiFetch } from "@/lib/api";
import type {
  Break,
  Spot,
  SpotAuctionEndedEvent,
  SpotAuctionStartedEvent,
  SpotBidPlacedEvent,
  SpotPurchasedEvent,
  SpotWonEvent,
  SpotRevealedEvent,
  BreakCompletedEvent,
} from "@/lib/break-types";

/**
 * Top-of-video win toast state. Set when `spot:won` arrives, cleared when
 * `spot:revealed` arrives (or after a fallback timeout if the reveal event
 * never lands).
 */
export interface WinToast {
  spotId: string;
  listingId: string;
  spotNumber: number;
  winnerId: string;
  winnerUsername: string;
  winnerAvatarUrl: string | null;
  soldPrice: number;
}

/**
 * Reveal toast — replaces the win toast at T+3s. Holds until a new spot's
 * win toast supersedes it or a short hold timer expires.
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

/**
 * Subscribes to all break-related WebSocket events for a stream and keeps
 * a `breaks` array in sync. Drives the auto-reveal overlays (winToast,
 * revealToast, personalWin).
 */
export function useStreamBreaks(
  streamId: string,
  socket: Socket | null,
  currentUserId?: string | null
) {
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [loading, setLoading] = useState(true);
  const [winToast, setWinToast] = useState<WinToast | null>(null);
  const [revealToast, setRevealToast] = useState<RevealToast | null>(null);
  const [personalWin, setPersonalWin] = useState<PersonalWin | null>(null);
  // Confetti is a tick: incrementing it tells the overlay to re-fire.
  const [confettiTick, setConfettiTick] = useState(0);
  // Wallet balance updates pushed by the server.
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const userIdRef = useRef<string | null | undefined>(currentUserId);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // ── Auto-reveal pipeline ──────────────────────────────────────────

    const onWon = (e: SpotWonEvent) => {
      // T+0: surface the win toast at top of video. Cleared by the matching
      // spot:revealed event ~3s later.
      setWinToast({
        spotId: e.spotId,
        listingId: e.listingId,
        spotNumber: e.spotNumber,
        winnerId: e.winnerId,
        winnerUsername: e.winnerUsername,
        winnerAvatarUrl: e.winnerAvatarUrl,
        soldPrice: e.soldPrice,
      });
      // Clear any old reveal toast — the new spot's win takes the spotlight.
      setRevealToast(null);
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };

    const onRevealed = (e: SpotRevealedEvent) => {
      // T+3: flip the spot to revealed in local state and morph the toast.
      setBreaks((prev) =>
        patchSpot(prev, e.spotId, {
          isRevealedToBuyers: true,
          revealedTeam: e.revealedTeam,
          revealedAt: e.revealedAt,
        })
      );

      // Drop the win toast and surface the reveal toast in its place.
      setWinToast(null);
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

      // Personal pop-up only for the spot's winner.
      if (userIdRef.current && e.winnerId === userIdRef.current) {
        setPersonalWin({
          spotId: e.spotId,
          spotNumber: e.spotNumber,
          revealedTeam: e.revealedTeam,
        });
      }
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
    socket.on("spot:auction_started", onAuctionStarted);
    socket.on("spot:bid_placed", onBidPlaced);
    socket.on("spot:auction_extended", onAuctionExtended);
    socket.on("spot:auction_ended", onAuctionEnded);
    socket.on("spot:purchased", onPurchased);
    socket.on("spot:skipped", onSkipped);
    socket.on("spot:won", onWon);
    socket.on("spot:revealed", onRevealed);
    socket.on("confetti", onConfetti);
    socket.on("wallet:balance_updated", onWallet);

    return () => {
      socket.off("break:created", onCreated);
      socket.off("break:started", onStarted);
      socket.off("break:completed", onCompleted);
      socket.off("spot:auction_started", onAuctionStarted);
      socket.off("spot:bid_placed", onBidPlaced);
      socket.off("spot:auction_extended", onAuctionExtended);
      socket.off("spot:auction_ended", onAuctionEnded);
      socket.off("spot:purchased", onPurchased);
      socket.off("spot:skipped", onSkipped);
      socket.off("spot:won", onWon);
      socket.off("spot:revealed", onRevealed);
      socket.off("confetti", onConfetti);
      socket.off("wallet:balance_updated", onWallet);
    };
  }, [socket]);

  // Cleanup the reveal hold timer on unmount.
  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

  return {
    breaks,
    loading,
    refresh,
    winToast,
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
