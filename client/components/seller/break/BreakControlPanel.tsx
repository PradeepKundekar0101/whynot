"use client";

import { useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  Play,
  Pin,
  Pencil,
  Trash2,
  Plus,
  ChevronDown,
  Sparkles,
  Hourglass,
  Trophy,
  ShoppingBag,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/break-format";
import type { Break, Spot, AckResponse } from "@/lib/break-types";
import { AuctionSettingsModal, type AuctionSettings } from "./AuctionSettingsModal";

interface BreakControlPanelProps {
  break: Break;
  socket: Socket | null;
}

function emit<T>(socket: Socket | null, event: string, data: T): Promise<AckResponse> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve({ ok: false, error: "DISCONNECTED", message: "Not connected" });
      return;
    }
    socket.emit(event, data, (ack: AckResponse) => resolve(ack));
  });
}

/**
 * Seller-side control panel for a single break. Reveals are fully automatic
 * (handled by the auction-end pipeline + scheduleAutoReveal on the server),
 * so this panel never shows a manual "Reveal Mode" UI; it's always the
 * auction-running surface.
 *
 * For random-format breaks the seller still sees `revealedTeam` for every
 * spot — the API serializer surfaces it for sellers — so they can see what's
 * coming up next even before buyers do.
 */
export function BreakControlPanel({ break: brk, socket }: BreakControlPanelProps) {
  const router = useRouter();
  const [auctionTarget, setAuctionTarget] = useState<Spot | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<{ available: boolean; sold: boolean }>(
    { available: true, sold: true }
  );

  const totalSpots = brk.spots.length;
  const sold = brk.spots.filter((s) => s.winnerId).length;
  const remaining = totalSpots - sold;
  const totalSalesCents = brk.spots.reduce((sum, s) => sum + (s.soldPrice ?? 0), 0);
  const uniqueBuyers = new Set(brk.spots.map((s) => s.winnerId).filter(Boolean)).size;

  const upNextSpot = useMemo(() => {
    return brk.spots.find((s) => s.auctionStatus === "active") ??
      brk.spots.find((s) => s.auctionStatus === "pending");
  }, [brk.spots]);

  const availableSpots = brk.spots.filter(
    (s) => s.auctionStatus === "pending" || s.auctionStatus === "active"
  );
  const soldSpots = brk.spots.filter((s) => s.winnerId);

  const handleStartBreaking = async () => {
    const ok = window.confirm(
      "Confirming that you are finished selling spots and starting to break. " +
        "When you click OK, all buyers will be notified that the break is starting. " +
        "If you are still selling spots, click cancel."
    );
    if (!ok) return;
    setActionError(null);
    setActionPending("start-break");
    const ack = await emit(socket, "seller:start_break", { listingId: brk.id });
    setActionPending(null);
    if (!ack.ok) setActionError(ack.message ?? ack.error);
  };

  const handleStartAuction = async (spot: Spot) => {
    setAuctionTarget(spot);
  };

  const submitAuctionStart = async (settings: AuctionSettings) => {
    if (!auctionTarget) return;
    setActionError(null);
    const ack = await emit(socket, "seller:start_spot_auction", {
      spotId: auctionTarget.id,
      ...settings,
    });
    if (!ack.ok) {
      setActionError(ack.message ?? ack.error);
      throw new Error(ack.error);
    }
  };

  const handleSkipSpot = async (spot: Spot) => {
    if (!window.confirm(`Skip ${spot.spotName}? Any active holds will be released.`)) return;
    setActionPending(`skip-${spot.id}`);
    const ack = await emit(socket, "seller:skip_spot", { spotId: spot.id });
    setActionPending(null);
    if (!ack.ok) setActionError(ack.message ?? ack.error);
  };

  // Completion summary — the break is done.
  if (brk.status === "completed") {
    return (
      <div className="flex flex-col h-full text-white p-4">
        <div className="flex flex-col items-center text-center mt-2 mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground mb-3 shadow-[0_0_30px_rgba(255,214,0,0.5)]">
            <Trophy className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold">Break Complete!</h2>
          <p className="text-sm text-white/60 mt-1">
            {sold} {sold === 1 ? "spot" : "spots"} sold to {uniqueBuyers}{" "}
            {uniqueBuyers === 1 ? "buyer" : "buyers"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-6">
          <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-white/50">Total Sales</p>
            <p className="text-xl font-bold text-primary mt-0.5">{formatCents(totalSalesCents)}</p>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-white/50">Sold</p>
            <p className="text-xl font-bold mt-0.5">
              {sold}
              <span className="text-white/30 text-base">/{totalSpots}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 mb-6">
          <button
            type="button"
            onClick={() => router.push("/seller/earnings")}
            className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
          >
            <ShoppingBag className="h-4 w-4" />
            View Earnings
          </button>
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("seller:open-create-break"));
            }}
            className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-lg border border-white/15 text-sm font-medium hover:bg-white/5 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Another Break
          </button>
        </div>

        {soldSpots.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-black/20 max-h-72 overflow-y-auto">
            <p className="px-3 py-2 text-xs uppercase tracking-wider text-white/50 border-b border-white/10">
              Sold ({soldSpots.length})
            </p>
            {soldSpots.map((s) => (
              <div key={s.id} className="px-3 py-2 border-b border-white/5">
                <p className="text-xs text-white/50">
                  Spot #{s.spotNumber} → @{s.winner?.username ?? "?"}
                </p>
                <p className="text-sm font-semibold text-primary truncate">
                  {s.revealedTeam ?? s.spotName}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-white">
      {/* Header */}
      <div className="px-3 py-3 border-b border-white/10">
        <div className="flex items-center gap-2 mb-2">
          {brk.status === "filling" ? (
            <button
              type="button"
              disabled={actionPending === "start-break"}
              onClick={handleStartBreaking}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-full bg-primary text-primary-foreground text-xs font-bold disabled:opacity-60 hover:bg-primary/90 transition-colors"
            >
              <Zap className="h-3.5 w-3.5" />
              Start Breaking
            </button>
          ) : (
            <span className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-full bg-red-500/15 text-red-400 text-xs font-bold border border-red-500/30">
              <Sparkles className="h-3.5 w-3.5" />
              Breaking Now
            </span>
          )}
        </div>

        <p className="text-[11px] uppercase tracking-wider text-white/50">
          {brk.breakFormat === "random" ? "Random Team" : "Pick Your Team"} · {brk.sellingMode === "auction" ? "Auction" : "Buy It Now"}
        </p>
        <p className="text-sm font-semibold text-white truncate" title={brk.breakName}>
          {brk.breakName}
        </p>

        <p
          className={cn(
            "mt-2 inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full",
            brk.status === "filling"
              ? "bg-amber-500/15 text-amber-400"
              : brk.status === "breaking"
                ? "bg-red-500/15 text-red-400"
                : "bg-green-500/15 text-green-400"
          )}
        >
          {brk.status === "filling" ? <Hourglass className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
          {brk.status === "filling" ? "Filling" : brk.status === "breaking" ? "Breaking Now" : "Completed"}
          <span className="text-white/50 ml-2">{remaining} of {totalSpots} left</span>
        </p>
      </div>

      {/* Up Next */}
      {brk.status === "breaking" && upNextSpot && (
        <div className="px-3 py-3 border-b border-white/10">
          <p className="text-[11px] uppercase tracking-wider text-white/50 mb-2">Up Next</p>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-sm font-semibold">{upNextSpot.spotName}</p>
            {/* For random format, show the seller what team is hiding behind this spot. */}
            {brk.breakFormat === "random" && upNextSpot.revealedTeam && (
              <p className="text-xs text-primary font-semibold mt-0.5">
                Hidden team: {upNextSpot.revealedTeam}
              </p>
            )}
            <p className="text-xs text-white/50 mt-0.5">{sold} of {totalSpots} sold</p>
            <div className="mt-2 flex items-center gap-2">
              {upNextSpot.auctionStatus === "active" ? (
                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 font-semibold">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  Live · ${(upNextSpot.currentBid ?? upNextSpot.startingBid ?? 0) / 100}
                </span>
              ) : brk.sellingMode === "auction" ? (
                <button
                  type="button"
                  onClick={() => handleStartAuction(upNextSpot)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
                >
                  <Play className="h-3 w-3" />
                  Start Auction
                </button>
              ) : (
                <p className="text-xs text-white/50 flex-1">Buy It Now — buyers can claim now</p>
              )}
            </div>
          </div>
        </div>
      )}

      {actionError && (
        <div className="px-3 py-2 border-b border-white/10">
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
            {actionError}
          </div>
        </div>
      )}

      {/* Available section */}
      <Section
        title="Available"
        count={availableSpots.length}
        open={openSection.available}
        onToggle={() =>
          setOpenSection((s) => ({ ...s, available: !s.available }))
        }
      >
        {availableSpots.length === 0 ? (
          <p className="text-xs text-white/40 px-3 py-2">No spots available.</p>
        ) : (
          availableSpots.map((spot) => (
            <SpotRow
              key={spot.id}
              spot={spot}
              showHiddenTeam={brk.breakFormat === "random"}
              onStartAuction={brk.sellingMode === "auction" ? handleStartAuction : undefined}
              onSkip={handleSkipSpot}
              actionPending={actionPending}
            />
          ))
        )}
      </Section>

      {/* Sold */}
      <Section
        title="Sold"
        count={soldSpots.length}
        open={openSection.sold}
        onToggle={() => setOpenSection((s) => ({ ...s, sold: !s.sold }))}
      >
        {soldSpots.length === 0 ? (
          <p className="text-xs text-white/40 px-3 py-2">No spots sold yet.</p>
        ) : (
          soldSpots.map((spot) => (
            <div key={spot.id} className="px-3 py-2 border-b border-white/5">
              <p className="text-sm font-medium truncate">
                {spot.revealedTeam ?? spot.spotName}
              </p>
              <p className="text-xs text-white/50 truncate">
                @{spot.winner?.username} · {formatCents(spot.soldPrice ?? 0)}
                {!spot.isRevealedToBuyers && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400">
                    Pending reveal
                  </span>
                )}
              </p>
            </div>
          ))
        )}
      </Section>

      <div className="mt-auto px-3 py-3 border-t border-white/10">
        <button
          type="button"
          disabled
          title="Coming soon — add a team mid-break"
          className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-white/10 text-xs font-medium text-white/40 cursor-not-allowed"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Team
        </button>
      </div>

      <AuctionSettingsModal
        open={!!auctionTarget}
        onClose={() => setAuctionTarget(null)}
        defaultStartingPrice={auctionTarget?.startingPrice ?? 100}
        spotName={auctionTarget?.spotName ?? ""}
        onConfirm={submitAuctionStart}
      />
    </div>
  );
}

function Section({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-white/10 flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full px-3 py-2 text-xs uppercase tracking-wider text-white/60 hover:bg-white/5"
      >
        <span className="flex items-center gap-1.5">
          <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
          {title}
        </span>
        <span className="text-white/40">({count})</span>
      </button>
      {open && <div className="bg-black/20">{children}</div>}
    </div>
  );
}

function SpotRow({
  spot,
  showHiddenTeam,
  onStartAuction,
  onSkip,
  actionPending,
}: {
  spot: Spot;
  showHiddenTeam: boolean;
  onStartAuction?: (spot: Spot) => void;
  onSkip: (spot: Spot) => void;
  actionPending: string | null;
}) {
  const isActive = spot.auctionStatus === "active";
  return (
    <div
      className={cn(
        "px-3 py-2 border-b border-white/5 hover:bg-white/5",
        isActive && "bg-primary/10"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{spot.spotName}</p>
          {/* Sellers see the hidden team (random format) so they know what's
              about to be sold. Buyers never see this until reveal. */}
          {showHiddenTeam && spot.revealedTeam && (
            <p className="text-[11px] text-primary font-semibold truncate">
              {spot.revealedTeam}
            </p>
          )}
          <p className="text-xs text-white/50">
            Starting {formatCents(spot.startingPrice)}
            {spot.currentBid ? ` · ${formatCents(spot.currentBid)}` : ""}
            {spot.bidCount > 0 ? ` · ${spot.bidCount} bid${spot.bidCount === 1 ? "" : "s"}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!isActive && onStartAuction && (
            <button
              type="button"
              onClick={() => onStartAuction(spot)}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Play className="h-3 w-3" />
              Start
            </button>
          )}
          {isActive && (
            <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-semibold bg-red-500/20 text-red-300">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              Live
            </span>
          )}
          <button
            type="button"
            disabled
            title="Pin coming soon"
            className="p-1 rounded text-white/30 cursor-not-allowed"
          >
            <Pin className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled
            title="Edit coming soon"
            className="p-1 rounded text-white/30 cursor-not-allowed"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onSkip(spot)}
            disabled={actionPending === `skip-${spot.id}`}
            title="Skip / remove this spot"
            className="p-1 rounded text-white/40 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
