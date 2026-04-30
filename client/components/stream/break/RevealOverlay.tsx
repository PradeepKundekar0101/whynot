"use client";

import { Loader2, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveReveal } from "@/hooks/useStreamBreaks";

interface RevealOverlayProps {
  reveal: ActiveReveal | null;
  randomizing?: boolean;
}

/**
 * Theater-mode overlay that sits on top of the live video for ALL viewers.
 * Two states:
 *  - "OPENING NOW" — while the seller is typing the reveal (no revealText yet)
 *  - "WINNER!"     — once the reveal text lands; shows for ~4s before
 *                    auto-advance kicks the next spot in.
 */
export function RevealOverlay({ reveal, randomizing }: RevealOverlayProps) {
  if (randomizing) {
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="text-center text-white">
          <Loader2 className="h-10 w-10 mx-auto animate-spin mb-3 text-primary" />
          <p className="text-xl font-bold tracking-wide">Randomizing assignments…</p>
          <p className="text-sm text-white/60 mt-1">Hold tight — the spin is rolling.</p>
        </div>
      </div>
    );
  }

  if (!reveal) return null;

  const revealed = !!reveal.revealText;

  return (
    <div className="absolute inset-x-0 top-0 z-30 pointer-events-none">
      <div
        className={cn(
          "mx-auto w-fit max-w-[90%] mt-6 px-6 py-4 rounded-2xl backdrop-blur-md transition-all duration-300",
          revealed
            ? "bg-primary text-primary-foreground shadow-[0_8px_40px_-10px_rgba(255,214,0,0.7)] scale-105"
            : "bg-black/75 text-white"
        )}
      >
        <div className="flex items-center gap-2 justify-center">
          {revealed ? (
            <>
              <Trophy className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-[0.18em]">
                Winner!
              </span>
            </>
          ) : (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.18em]">
                Opening Now
              </span>
            </>
          )}
        </div>

        <div className="text-center mt-2">
          <p className={cn("text-2xl font-extrabold tabular-nums", revealed && "text-primary-foreground")}>
            Spot #{reveal.spotNumber}
          </p>
          {reveal.winnerUsername && (
            <p className={cn("text-sm mt-0.5", revealed ? "text-primary-foreground/80" : "text-white/80")}>
              @{reveal.winnerUsername}
              {revealed ? " got" : "..."}
            </p>
          )}

          {revealed ? (
            <p className="mt-3 text-3xl font-extrabold drop-shadow-sm reveal-bounce">
              {reveal.revealText}
            </p>
          ) : (
            <div className="mt-3 inline-flex items-center gap-2 text-white/60 text-sm">
              <Sparkles className="h-4 w-4 animate-pulse" />
              <span>Awaiting reveal…</span>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        :global(.reveal-bounce) {
          animation: reveal-bounce 600ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes reveal-bounce {
          0% {
            transform: scale(0.6);
            opacity: 0;
          }
          60% {
            transform: scale(1.15);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
