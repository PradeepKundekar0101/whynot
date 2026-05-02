"use client";

import Image from "next/image";
import { Trophy } from "lucide-react";
import type { WinToast, RevealToast } from "@/hooks/useStreamBreaks";
import { formatCents } from "@/lib/break-format";
import { cn } from "@/lib/utils";

interface Props {
  winToast: WinToast | null;
  revealToast: RevealToast | null;
}

/**
 * Top-of-video toast that runs the Whatnot-style "X won the auction!" → reveal
 * sequence. Two states with the same physical position so the morph between
 * them feels like one continuous element rather than two stacked overlays:
 *
 *   1. WinToast    (T+0):  avatar + "@user won the auction!"
 *   2. RevealToast (T+3s): avatar + "@user's spot is …" + bold team name
 *
 * The reveal toast supersedes the win toast when both are momentarily set.
 */
export function AutoRevealToast({ winToast, revealToast }: Props) {
  if (revealToast) return <RevealToastView toast={revealToast} />;
  if (winToast) return <WinToastView toast={winToast} />;
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

function WinToastView({ toast }: { toast: WinToast }) {
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
            won the auction!
            {toast.soldPrice > 0 && (
              <span className="ml-1.5 text-primary font-bold">
                {formatCents(toast.soldPrice)}
              </span>
            )}
          </p>
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

function RevealToastView({ toast }: { toast: RevealToast }) {
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
            @{toast.winnerUsername}&rsquo;s spot is …
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
