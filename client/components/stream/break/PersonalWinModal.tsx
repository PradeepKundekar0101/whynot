"use client";

import { useEffect, useState } from "react";
import { PartyPopper, Trophy } from "lucide-react";
import { ConfettiOverlay } from "@/components/stream/ConfettiOverlay";
import { playPersonalWinFanfare } from "@/lib/sound-effects";
import type { PersonalWin } from "@/hooks/useStreamBreaks";

interface Props {
  win: PersonalWin | null;
  onClose: () => void;
}

export function PersonalWinModal({ win, onClose }: Props) {
  if (!win) return null;
  return <PersonalWinModalInner key={`${win.spotId}-${win.revealText}`} win={win} onClose={onClose} />;
}

function PersonalWinModalInner({ win, onClose }: { win: PersonalWin; onClose: () => void }) {
  // Stable confetti trigger — only changes on (re)mount per spotId+revealText (parent keys us).
  const [confettiTrigger] = useState(() => Date.now());

  // Fire the celebration sound when the modal first appears.
  useEffect(() => {
    try {
      playPersonalWinFanfare();
    } catch {
      // best effort — browsers may block first audio without a gesture
    }
  }, []);

  // ESC dismiss + backdrop click both handled here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />
      <ConfettiOverlay trigger={confettiTrigger} />

      <div className="relative w-full max-w-md rounded-3xl bg-gradient-to-br from-primary/30 via-primary/10 to-transparent border border-primary/40 p-8 text-center shadow-2xl personal-win-pop">
        <div className="absolute inset-0 rounded-3xl border border-white/10 pointer-events-none" />

        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary text-primary-foreground mb-4 shadow-[0_0_40px_rgba(255,214,0,0.6)]">
          <Trophy className="h-8 w-8" />
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-white">
          You got it!
        </h1>
        <p className="text-sm text-white/70 mt-1">
          {win.isRebroadcast ? "Replay" : "Live reveal"} for Spot #{win.spotNumber}
        </p>

        <div className="mt-6 px-4 py-5 rounded-2xl bg-black/40 border border-primary/30">
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary/80 mb-2">
            Your reveal
          </p>
          <p className="text-3xl font-extrabold text-primary leading-tight reveal-bounce">
            {win.revealText}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full h-12 rounded-full bg-primary text-primary-foreground font-bold inline-flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
        >
          <PartyPopper className="h-5 w-5" />
          Awesome!
        </button>
      </div>

      <style jsx>{`
        :global(.personal-win-pop) {
          animation: personal-win-pop 480ms cubic-bezier(0.2, 0.7, 0.2, 1);
        }
        @keyframes personal-win-pop {
          0% {
            transform: scale(0.6) translateY(40px);
            opacity: 0;
          }
          70% {
            transform: scale(1.05) translateY(-4px);
            opacity: 1;
          }
          100% {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
