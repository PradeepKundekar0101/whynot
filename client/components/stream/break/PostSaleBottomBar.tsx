"use client";

import type { Break, Spot } from "@/lib/break-types";
import { spotTypeCopy } from "@/lib/break-types";
import { formatCents } from "@/lib/break-format";

interface Props {
  breakItem: Break | null;
  /**
   * The spot whose state drives the bottom strip — typically the most recently
   * sold spot (auction won or buy-it-now) so the title morphs into the team
   * name once the reveal fires.
   */
  spot: Spot | null;
}

/**
 * Bottom-of-video strip shown between auctions. Adapts to assignmentMode:
 *
 *   - pick_your: title = breakName + spotName (already public)
 *   - pre_assigned / random_per_spot:
 *     - sold-not-yet-revealed: "Break Name — Spot #N" + "Awaiting reveal…"
 *     - revealed:              "Break Name — {Team Name}" + "Sold" pill
 *   - random_at_end: "Break Name — Spot #N" until completion-time batch reveal
 *
 * The auto-reveal toast handles the celebratory beat above the video; this is
 * the persistent context strip below it.
 */
export function PostSaleBottomBar({ breakItem, spot }: Props) {
  if (!breakItem) return null;

  const copy = spotTypeCopy(breakItem.spotType);
  const isRandomAtEnd = breakItem.assignmentMode === "random_at_end";
  const isPickYour = breakItem.assignmentMode === "pick_your";

  const titleSuffix = spot
    ? spot.isRevealedToBuyers && spot.revealedTeam
      ? ` — ${spot.revealedTeam}`
      : ` — Spot #${spot.spotNumber}`
    : "";

  const soldPrice = spot?.soldPrice ?? null;

  // CTA copy adapts to the reveal model: pick_your has no reveal beat, so we
  // just nudge to the next sale; random_at_end stays in suspense until the
  // break completes; per-spot modes flow win → reveal → next sale.
  const ctaText = isPickYour
    ? "Awaiting next item…"
    : isRandomAtEnd
      ? "All reveals at end of break"
      : spot && !spot.isRevealedToBuyers
        ? `Awaiting ${copy.singular} reveal…`
        : "Awaiting next item…";

  return (
    <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-12 bg-gradient-to-t from-black/95 via-black/70 to-transparent pointer-events-none">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-white text-base font-bold truncate">
            {breakItem.breakName}
            {titleSuffix}
          </p>
          {soldPrice !== null && (
            <p className="text-white/70 text-xs">
              Final bid {formatCents(soldPrice)}
              <span className="ml-2 inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/10 text-white/90">
                Sold
              </span>
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled
        className="mt-3 w-full h-11 rounded-full bg-primary/90 text-primary-foreground text-sm font-bold cursor-not-allowed opacity-90 pointer-events-none"
      >
        {ctaText}
      </button>
    </div>
  );
}
