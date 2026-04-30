"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ActiveSpin } from "@/hooks/useStreamBreaks";

interface SpinAnimationProps {
  spin: ActiveSpin | null;
  onClose: () => void;
}

function buildStrip(candidates: string[], resolved: string | null): string[] {
  const base = candidates.length > 0 ? candidates : ["???"];
  const repeats = Math.max(8, Math.ceil(60 / Math.max(1, base.length)));
  const out: string[] = [];
  for (let r = 0; r < repeats; r++) {
    const shuffled = [...base].sort(() => Math.random() - 0.5);
    out.push(...shuffled);
  }
  if (resolved) out.push(resolved);
  return out;
}

/**
 * Whatnot-style spin reveal:
 * 1. spin:started → server says "here are the candidates" + duration tier
 * 2. UI animates a vertical strip of candidate names ticking past
 * 3. spin:completed → server reveals the assigned name; we slow-down on it
 *
 * The server is the single source of truth for the assigned name; the client
 * only animates. The strip is a long randomly-shuffled stream of candidates
 * with the resolved name placed at a deterministic position so the deceleration
 * lands cleanly on it.
 */
export function SpinAnimation({ spin, onClose }: SpinAnimationProps) {
  if (!spin) return null;
  // Force remount per spin so the strip is shuffled fresh and the animation restarts.
  // The key includes the resolvedName so once the server reveals it, we re-render
  // with the resolved name appended to the strip.
  return (
    <SpinAnimationInner
      key={`${spin.spotId}-${spin.resolvedName ?? "pending"}`}
      spin={spin}
      onClose={onClose}
    />
  );
}

function SpinAnimationInner({
  spin,
  onClose,
}: {
  spin: ActiveSpin;
  onClose: () => void;
}) {
  // useState initializer runs once per mount — Math.random is fine here.
  const [strip] = useState(() => buildStrip(spin.candidates, spin.resolvedName));
  const resolved = spin.resolvedName;

  // Auto-dismiss 4s after the result is shown.
  useEffect(() => {
    if (!resolved) return;
    const id = setTimeout(() => onClose(), 4000);
    return () => clearTimeout(id);
  }, [resolved, onClose]);

  const spinDurationMs = spin.quickSpin ? 3000 : 6000;
  // Distance to scroll: every row is 56px; total rows minus a "viewport" buffer.
  const rowHeight = 56;
  const totalDistance = (strip.length - 3) * rowHeight;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-sm">
      <div className="text-center max-w-md w-full px-6">
        <p className="text-white/70 text-sm mb-2">
          {spin.winnerUsername ? <>@{spin.winnerUsername}&rsquo;s spot is&hellip;</> : "Picking a spot..."}
        </p>

        <div className="relative h-[168px] overflow-hidden rounded-2xl border border-white/15 bg-black/60 mb-6">
          {/* Strip */}
          <div
            className={cn(
              "flex flex-col items-center will-change-transform",
              spin.resolvedName ? "spin-strip-stop" : "spin-strip-running"
            )}
            style={
              {
                "--scroll-distance": `-${totalDistance}px`,
                "--spin-duration": `${spinDurationMs}ms`,
              } as React.CSSProperties
            }
          >
            {strip.map((name, i) => (
              <div
                key={`${name}-${i}`}
                className="h-14 flex items-center justify-center w-full text-2xl font-bold text-white whitespace-nowrap"
              >
                {name}
              </div>
            ))}
          </div>

          {/* Center indicator */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-14 border-y-2 border-primary" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black via-transparent to-black" />
        </div>

        {spin.resolvedName && (
          <div className="animate-pulse">
            <p className="text-white/70 text-xs uppercase tracking-wider">Assigned</p>
            <p className="text-3xl font-extrabold text-primary mt-1">{spin.resolvedName}</p>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-6 text-xs text-white/40 hover:text-white"
        >
          {spin.resolvedName ? "Tap to dismiss" : "Spinning…"}
        </button>
      </div>

      <style jsx>{`
        .spin-strip-running {
          animation: spin-scroll var(--spin-duration) cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
        }
        .spin-strip-stop {
          animation: spin-scroll var(--spin-duration) cubic-bezier(0.05, 0.7, 0.05, 1) forwards;
        }
        @keyframes spin-scroll {
          from {
            transform: translateY(0);
          }
          to {
            transform: translateY(var(--scroll-distance));
          }
        }
      `}</style>
    </div>
  );
}
