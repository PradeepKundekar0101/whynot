"use client";

import { useEffect, useMemo, useState } from "react";

const COLORS = [
  "#FFD600", // primary yellow
  "#ef4444", // red
  "#22c55e", // green
  "#3b82f6", // blue
  "#a855f7", // purple
  "#f97316", // orange
];

interface Piece {
  id: number;
  left: number;
  delay: number;
  duration: number;
  rotate: number;
  color: string;
  size: number;
}

function generatePieces(count: number, seed: number): Piece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: seed * 1000 + i,
    left: Math.random() * 100,
    delay: Math.random() * 200,
    duration: 1500 + Math.random() * 1500,
    rotate: Math.random() * 360,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: 6 + Math.random() * 6,
  }));
}

export function ConfettiOverlay({ trigger }: { trigger: number }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (trigger > 0) {
      setActive(trigger);
      const timer = setTimeout(() => setActive(0), 3500);
      return () => clearTimeout(timer);
    }
  }, [trigger]);

  const pieces = useMemo(() => (active ? generatePieces(120, active) : []), [active]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[150] overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute confetti-piece"
          style={{
            left: `${p.left}%`,
            top: "-20px",
            width: `${p.size}px`,
            height: `${p.size * 0.4}px`,
            backgroundColor: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.duration}ms`,
          }}
        />
      ))}
      <style jsx>{`
        .confetti-piece {
          animation-name: confetti-fall;
          animation-timing-function: cubic-bezier(0.2, 0.7, 0.5, 1);
          animation-fill-mode: forwards;
          border-radius: 1px;
        }
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(110vh) rotate(720deg);
            opacity: 0.6;
          }
        }
      `}</style>
    </div>
  );
}
