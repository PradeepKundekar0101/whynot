"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { apiFetch } from "@/lib/api";
import type {
  Break,
  Spot,
  SpotAssignedEvent,
  SpotAuctionEndedEvent,
  SpotAuctionStartedEvent,
  SpotBidPlacedEvent,
  SpotPurchasedEvent,
  SpotSpinCompletedEvent,
  SpotSpinStartedEvent,
  SpotRevealStartedEvent,
  SpotRevealedEvent,
  SpotRevealSkippedEvent,
  BreakRandomizingEvent,
  BreakCompletedEvent,
  SpotReorderEvent,
} from "@/lib/break-types";

export interface ActiveSpin {
  spotId: string;
  listingId: string;
  candidates: string[];
  quickSpin: boolean;
  /** Set when the spin completes — used to drive the final reveal. */
  resolvedName: string | null;
  winnerId: string | null;
  winnerUsername: string | null;
  /** Server-confirmed deadline so we know when to remove the overlay even if completed event is missed. */
  startedAtMs: number;
}

/** State for the buyer-facing center-video "OPENING NOW" / "WINNER!" overlay. */
export interface ActiveReveal {
  spotId: string;
  listingId: string;
  spotNumber: number;
  spotName: string;
  winnerId: string | null;
  winnerUsername: string | null;
  winnerAvatarUrl: string | null;
  /** Revealed when the seller hits Confirm. Until then this is null and we show "OPENING NOW". */
  revealText: string | null;
}

/** State for the personal "you got it!" modal that pops only for the winning user. */
export interface PersonalWin {
  spotId: string;
  spotNumber: number;
  revealText: string;
  isRebroadcast: boolean;
}

/** Brief banner shown for ~2 seconds while the server runs the Fisher-Yates shuffle. */
export interface RandomizingState {
  listingId: string;
  startedAtMs: number;
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

/**
 * Subscribes to all break-related WebSocket events for a stream and keeps
 * a `breaks` array in sync. Returns the local state plus an `activeSpin`
 * piece for the SpinAnimation overlay.
 *
 * `currentUserId` is used to decide whether to fire a personal-win modal
 * for the recipient of a reveal.
 */
export function useStreamBreaks(
  streamId: string,
  socket: Socket | null,
  currentUserId?: string | null
) {
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSpin, setActiveSpin] = useState<ActiveSpin | null>(null);
  const [activeReveal, setActiveReveal] = useState<ActiveReveal | null>(null);
  const [personalWin, setPersonalWin] = useState<PersonalWin | null>(null);
  const [randomizing, setRandomizing] = useState<RandomizingState | null>(null);
  // Confetti is just a tick: incrementing it tells the overlay to re-fire.
  const [confettiTick, setConfettiTick] = useState(0);
  // Wallet balance updates pushed by the server.
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const breaksRef = useRef<Break[]>([]);
  const userIdRef = useRef<string | null | undefined>(currentUserId);
  useEffect(() => {
    breaksRef.current = breaks;
  }, [breaks]);
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

    const onSpinStarted = (e: SpotSpinStartedEvent) => {
      const found = breaksRef.current
        .flatMap((b) => b.spots.map((s) => ({ s, listingId: b.id })))
        .find(({ s }) => s.id === e.spotId);
      setActiveSpin({
        spotId: e.spotId,
        listingId: found?.listingId ?? "",
        candidates: e.candidateNames,
        quickSpin: e.quickSpin,
        resolvedName: null,
        winnerId: found?.s.winnerId ?? null,
        winnerUsername: found?.s.winner?.username ?? null,
        startedAtMs: Date.now(),
      });
    };

    const onSpinCompleted = (e: SpotSpinCompletedEvent) => {
      setActiveSpin((prev) =>
        prev && prev.spotId === e.spotId
          ? {
              ...prev,
              resolvedName: e.assignedName,
              winnerId: e.winnerId ?? prev.winnerId,
              winnerUsername: e.winnerUsername ?? prev.winnerUsername,
            }
          : prev
      );
    };

    const onAssigned = (e: SpotAssignedEvent) => {
      setBreaks((prev) =>
        patchSpot(prev, e.spotId, {
          assignedName: e.assignedName,
          spinPlayedAt: new Date().toISOString(),
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

    // ── Reveal-mode events ────────────────────────────────────────────

    const onRandomizing = (e: BreakRandomizingEvent) => {
      setRandomizing({ listingId: e.listingId, startedAtMs: Date.now() });
      setBreaks((prev) => patchBreak(prev, e.listingId, { status: "randomizing" }));
      // Auto-clear after 3s in case the revealing_started event is missed.
      setTimeout(() => {
        setRandomizing((cur) => (cur && cur.listingId === e.listingId ? null : cur));
      }, 3000);
    };

    const onRevealingStarted = (e: {
      listingId: string;
      assignments: Array<{
        spotId: string;
        spotNumber: number;
        winnerId: string | null;
        winnerUsername: string | null;
      }>;
    }) => {
      setRandomizing(null);
      setBreaks((prev) => {
        const list = prev.map((b) => {
          if (b.id !== e.listingId) return b;
          // Apply the post-shuffle winner reassignment from the assignments table.
          const byId = new Map(e.assignments.map((a) => [a.spotId, a]));
          return {
            ...b,
            status: "revealing" as const,
            revealStartedAt: new Date().toISOString(),
            spots: b.spots.map((s) => {
              const a = byId.get(s.id);
              if (!a) return s;
              if (a.winnerId === s.winnerId) return s;
              return {
                ...s,
                winnerId: a.winnerId,
                winner: a.winnerId
                  ? { id: a.winnerId, username: a.winnerUsername ?? "", avatarUrl: null }
                  : null,
              };
            }),
          };
        });
        return list;
      });
    };

    const onRevealStarted = (e: SpotRevealStartedEvent) => {
      setBreaks((prev) =>
        patchBreak(
          patchSpot(prev, e.spotId, { revealStatus: "revealing" }),
          e.listingId,
          { currentRevealingSpotId: e.spotId }
        )
      );
      setActiveReveal({
        spotId: e.spotId,
        listingId: e.listingId,
        spotNumber: e.spotNumber,
        spotName: e.spotName,
        winnerId: e.winnerId,
        winnerUsername: e.winnerUsername,
        winnerAvatarUrl: e.winnerAvatarUrl,
        revealText: null,
      });
    };

    const onRevealed = (e: SpotRevealedEvent) => {
      setBreaks((prev) =>
        patchBreak(
          patchSpot(prev, e.spotId, {
            revealStatus: "revealed",
            revealText: e.revealText,
            revealedAt: new Date().toISOString(),
            revealOrder: e.revealOrder,
          }),
          e.listingId,
          { currentRevealingSpotId: null }
        )
      );

      // Update the centre overlay so it flips OPENING NOW → WINNER!
      // (Skip for edits — they're silent updates.)
      if (!e.isEdit) {
        setActiveReveal((cur) =>
          cur && cur.spotId === e.spotId
            ? { ...cur, revealText: e.revealText, winnerId: e.winnerId, winnerUsername: e.winnerUsername }
            : {
                spotId: e.spotId,
                listingId: e.listingId,
                spotNumber: e.spotNumber,
                spotName: e.spotName,
                winnerId: e.winnerId,
                winnerUsername: e.winnerUsername,
                winnerAvatarUrl: e.winnerAvatarUrl,
                revealText: e.revealText,
              }
        );

        // Personal pop-up only for the spot's winner.
        if (e.winnerId && userIdRef.current && e.winnerId === userIdRef.current) {
          setPersonalWin({
            spotId: e.spotId,
            spotNumber: e.spotNumber,
            revealText: e.revealText,
            isRebroadcast: !!e.isRebroadcast,
          });
        }
      }
    };

    const onRevealSkipped = (e: SpotRevealSkippedEvent) => {
      setBreaks((prev) =>
        patchBreak(
          patchSpot(prev, e.spotId, { revealStatus: "skipped" }),
          e.listingId,
          { currentRevealingSpotId: null }
        )
      );
      setActiveReveal((cur) => (cur && cur.spotId === e.spotId ? null : cur));
    };

    const onReorder = (e: SpotReorderEvent) => {
      setBreaks((prev) => patchSpot(prev, e.spotId, { isPinned: e.isPinned }));
    };

    const onCompleted = (e: BreakCompletedEvent) => {
      setBreaks((prev) =>
        patchBreak(prev, e.listingId, {
          status: "completed",
          completedAt: new Date().toISOString(),
          currentRevealingSpotId: null,
        })
      );
      setActiveReveal((cur) => (cur && cur.listingId === e.listingId ? null : cur));
    };

    socket.on("break:created", onCreated);
    socket.on("break:started", onStarted);
    socket.on("break:randomizing", onRandomizing);
    socket.on("break:revealing_started", onRevealingStarted);
    socket.on("break:completed", onCompleted);
    socket.on("spot:auction_started", onAuctionStarted);
    socket.on("spot:bid_placed", onBidPlaced);
    socket.on("spot:auction_extended", onAuctionExtended);
    socket.on("spot:auction_ended", onAuctionEnded);
    socket.on("spot:purchased", onPurchased);
    socket.on("spot:spin_started", onSpinStarted);
    socket.on("spot:spin_completed", onSpinCompleted);
    socket.on("spot:assigned", onAssigned);
    socket.on("spot:skipped", onSkipped);
    socket.on("spot:reveal_started", onRevealStarted);
    socket.on("spot:revealed", onRevealed);
    socket.on("spot:reveal_skipped", onRevealSkipped);
    socket.on("spot:reorder", onReorder);
    socket.on("confetti", onConfetti);
    socket.on("wallet:balance_updated", onWallet);

    return () => {
      socket.off("break:created", onCreated);
      socket.off("break:started", onStarted);
      socket.off("break:randomizing", onRandomizing);
      socket.off("break:revealing_started", onRevealingStarted);
      socket.off("break:completed", onCompleted);
      socket.off("spot:auction_started", onAuctionStarted);
      socket.off("spot:bid_placed", onBidPlaced);
      socket.off("spot:auction_extended", onAuctionExtended);
      socket.off("spot:auction_ended", onAuctionEnded);
      socket.off("spot:purchased", onPurchased);
      socket.off("spot:spin_started", onSpinStarted);
      socket.off("spot:spin_completed", onSpinCompleted);
      socket.off("spot:assigned", onAssigned);
      socket.off("spot:skipped", onSkipped);
      socket.off("spot:reveal_started", onRevealStarted);
      socket.off("spot:revealed", onRevealed);
      socket.off("spot:reveal_skipped", onRevealSkipped);
      socket.off("spot:reorder", onReorder);
      socket.off("confetti", onConfetti);
      socket.off("wallet:balance_updated", onWallet);
    };
  }, [socket]);

  return {
    breaks,
    loading,
    refresh,
    activeSpin,
    dismissSpin: () => setActiveSpin(null),
    activeReveal,
    dismissReveal: () => setActiveReveal(null),
    personalWin,
    dismissPersonalWin: () => setPersonalWin(null),
    randomizing,
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
