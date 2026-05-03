"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Trophy, Hourglass } from "lucide-react";
import type { ActiveSpin, RevealToast, WinToast } from "@/hooks/useStreamBreaks";
import { spotTypeCopy, type SpotType } from "@/lib/break-types";
import { formatCents } from "@/lib/break-format";
import { cn } from "@/lib/utils";

interface Props {
  /** Look up the buyer-facing copy noun (team/character/pack/etc.) for this spot's break. */
  spotType: SpotType | null;
  winToast: WinToast | null;
  activeSpin: ActiveSpin | null;
  revealToast: RevealToast | null;
}

/**
 * Top-of-video toast that runs the Whatnot-style win → spin → reveal sequence.
 * Same physical position across all three states so the morph between them
 * feels like one continuous element.
 *
 * Precedence: revealToast > activeSpin > winToast.
 *
 *   1. WinToast    (T+0):       avatar + "@user won the auction!"
 *                               + "Awaiting spin…" hint when autoRandomize=false
 *   2. SpinOverlay (mid-spin):  avatar + cycling candidate teams
 *   3. RevealToast (after):     avatar + "@user's {team|character} is …" + bold name
 */
export function AutoRevealToast({ spotType, winToast, activeSpin, revealToast }: Props) {
  const copy = spotTypeCopy(spotType ?? "slot");
  if (revealToast) return <RevealToastView toast={revealToast} copy={copy} />;
  if (activeSpin) return <SpinView spin={activeSpin} copy={copy} />;
  if (winToast) return <WinToastView toast={winToast} copy={copy} />;
  return null;
}

function Avatar({
  url,
  fallback,
}: {
  url: string | null;
  fallback: string;
}) {
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={40}
        height={40}
        className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-white/20"
      />
    );
  }
  return (
    <span className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0 ring-2 ring-white/20">
      {fallback.charAt(0).toUpperCase()}
    </span>
  );
}

function WinToastView({
  toast,
  copy,
}: {
  toast: WinToast;
  copy: { singular: string; awaiting: string };
}) {
  // Manual-spin mode: tell buyers their reveal is on the way once the seller
  // hits "Spin Now". Hidden for pick_your / random_at_end (no reveal coming)
  // and for auto-spin (the spin event will land in <= 3-6 s anyway).
  const expectsManualSpin =
    !toast.autoRandomize &&
    (toast.assignmentMode === "pre_assigned" || toast.assignmentMode === "random_per_spot");

  return (
    <div
      className={cn(
        "absolute left-1/2 top-6 z-30 -translate-x-1/2 pointer-events-none",
        "win-toast-pop"
      )}
    >
      <div className="flex items-center gap-3 max-w-[90vw] rounded-2xl bg-black/75 backdrop-blur-md text-white px-3 py-2.5 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.6)]">
        <Avatar url={toast.winnerAvatarUrl} fallback={toast.winnerUsername} />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">
            @{toast.winnerUsername}
          </p>
          <p className="text-xs text-white/80 leading-tight">
            won Spot #{toast.spotNumber}!
            {toast.soldPrice > 0 && (
              <span className="ml-1.5 text-primary font-bold">
                {formatCents(toast.soldPrice)}
              </span>
            )}
          </p>
          {expectsManualSpin && (
            <p className="mt-1 text-[11px] text-amber-200/90 leading-tight inline-flex items-center gap-1">
              <Hourglass className="h-3 w-3" />
              {copy.awaiting}
            </p>
          )}
        </div>
      </div>

      <style jsx>{`
        :global(.win-toast-pop) {
          animation: win-toast-pop 380ms cubic-bezier(0.2, 0.7, 0.2, 1);
        }
        @keyframes win-toast-pop {
          0% {
            transform: translate(-50%, -16px);
            opacity: 0;
          }
          100% {
            transform: translate(-50%, 0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Cycles through the candidate names while the spin animation runs.
 * Cycle speed depends on the total spin duration so it feels like a slot
 * machine slowing into the result. Server still picks the actual landing —
 * we never compute it client-side.
 */
function SpinView({
  spin,
  copy,
}: {
  spin: ActiveSpin;
  copy: { singular: string };
}) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (spin.candidates.length === 0) return;
    // Slow down toward the end of the spin: each tick lasts ~80 ms early,
    // ramping up to ~280 ms by the final 25 %.
    let cancelled = false;
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      i = (i + 1) % spin.candidates.length;
      setIdx(i);
      const elapsed = Date.now() - spin.startedAtMs;
      const progress = Math.min(1, elapsed / spin.durationMs);
      const interval = 80 + progress * progress * 220;
      setTimeout(tick, interval);
    };
    setTimeout(tick, 80);
    return () => {
      cancelled = true;
    };
  }, [spin.candidates, spin.durationMs, spin.startedAtMs]);

  const current = spin.candidates[idx] ?? "—";
  return (
    <div className="absolute left-1/2 top-6 z-30 -translate-x-1/2 pointer-events-none">
      <div className="flex flex-col items-center gap-1 max-w-[90vw] rounded-2xl bg-black/85 backdrop-blur-md text-white px-4 py-3 shadow-[0_12px_36px_-8px_rgba(0,0,0,0.7)] ring-1 ring-primary/40">
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary/90 font-bold">
          Spinning {copy.singular}…
        </p>
        <p className="text-2xl font-extrabold tabular-nums leading-tight spin-cycle">
          {current}
        </p>
      </div>

      <style jsx>{`
        :global(.spin-cycle) {
          animation: spin-flicker 80ms infinite;
        }
        @keyframes spin-flicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}

function RevealToastView({
  toast,
  copy,
}: {
  toast: RevealToast;
  copy: { singular: string };
}) {
  return (
    <div
      className={cn(
        "absolute left-1/2 top-6 z-30 -translate-x-1/2 pointer-events-none",
        "reveal-toast-morph"
      )}
    >
      <div className="flex items-center gap-3 max-w-[90vw] rounded-2xl bg-primary text-primary-foreground px-3 py-2.5 shadow-[0_12px_36px_-8px_rgba(255,214,0,0.55)]">
        <Avatar url={toast.winnerAvatarUrl} fallback={toast.winnerUsername} />
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-tight opacity-80 truncate">
            <Trophy className="inline h-3 w-3 mr-1" />
            @{toast.winnerUsername}&rsquo;s {copy.singular} is …
          </p>
          <p className="text-base font-extrabold leading-tight truncate">
            {toast.revealedTeam}
          </p>
        </div>
      </div>

      <style jsx>{`
        :global(.reveal-toast-morph) {
          animation: reveal-toast-morph 480ms cubic-bezier(0.2, 0.7, 0.2, 1);
        }
        @keyframes reveal-toast-morph {
          0% {
            transform: translate(-50%, 0) scale(0.92);
            opacity: 0.4;
          }
          70% {
            transform: translate(-50%, 0) scale(1.06);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, 0) scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
