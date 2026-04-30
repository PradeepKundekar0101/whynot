"use client";

import { Hourglass, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Break } from "@/lib/break-types";

interface Props {
  break: Break;
  active: boolean;
  onSeeSpots: (b: Break) => void;
}

export function BreakCardCompact({ break: brk, active, onSeeSpots }: Props) {
  const sold = brk.spots.filter((s) => s.winnerId).length;
  const total = brk.spots.length;
  const remaining = total - sold;
  const progress = total > 0 ? (sold / total) * 100 : 0;
  const formatLabel = brk.breakFormat === "pick_your" ? "Pick Your Team" : "Random Team";
  const buttonLabel = brk.breakFormat === "pick_your" ? "See Teams" : "See Spots";

  const statusBadge =
    brk.status === "filling" ? (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
        <Hourglass className="h-3 w-3" />
        Filling
      </span>
    ) : brk.status === "breaking" ? (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
        <Sparkles className="h-3 w-3" />
        Breaking Now
      </span>
    ) : brk.status === "completed" ? (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
        Completed
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">Cancelled</span>
    );

  return (
    <div
      className={cn(
        "rounded-xl border p-3 bg-white transition-shadow",
        active
          ? "border-primary shadow-[0_0_0_3px_rgba(255,214,0,0.18)]"
          : "border-border hover:shadow-sm"
      )}
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {formatLabel}
      </p>
      <p className="text-sm font-semibold leading-snug mb-2 line-clamp-2">{brk.breakName}</p>

      {/* Progress bar */}
      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between mb-3">
        {statusBadge}
        <span className="text-xs text-muted-foreground">
          {remaining} of {total} left
        </span>
      </div>

      <button
        type="button"
        onClick={() => onSeeSpots(brk)}
        className="w-full h-9 rounded-lg border border-border text-sm font-semibold hover:bg-secondary transition-colors"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
