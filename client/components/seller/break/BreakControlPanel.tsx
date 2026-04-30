"use client";

import { useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  Play,
  Zap,
  Pin,
  Pencil,
  Trash2,
  Plus,
  ChevronDown,
  Sparkles,
  Hourglass,
} from "lucide-react";
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

export function BreakControlPanel({ break: brk, socket }: BreakControlPanelProps) {
  const [auctionTarget, setAuctionTarget] = useState<Spot | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<{ available: boolean; awaiting: boolean; assigned: boolean }>(
    { available: true, awaiting: true, assigned: true }
  );

  const totalSpots = brk.spots.length;
  const sold = brk.spots.filter((s) => s.winnerId).length;
  const remaining = totalSpots - sold;

  const upNextSpot = useMemo(() => {
    return brk.spots.find((s) => s.auctionStatus === "active") ??
      brk.spots.find((s) => s.auctionStatus === "pending");
  }, [brk.spots]);

  const availableSpots = brk.spots.filter(
    (s) => s.auctionStatus === "pending" || s.auctionStatus === "active"
  );
  const awaitingAssignment = brk.spots.filter(
    (s) =>
      brk.breakFormat === "random" &&
      s.winnerId &&
      !s.assignedName
  );
  const assigned = brk.spots.filter((s) => s.winnerId && (brk.breakFormat === "pick_your" || s.assignedName));

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

  const handleManualSpin = async (spot: Spot) => {
    setActionPending(`spin-${spot.id}`);
    const ack = await emit(socket, "seller:trigger_spin", { spotId: spot.id });
    setActionPending(null);
    if (!ack.ok) setActionError(ack.message ?? ack.error);
  };

  const handleRandomizeAll = async () => {
    setActionPending("randomize-all");
    const ack = await emit(socket, "seller:randomize_all", { listingId: brk.id });
    setActionPending(null);
    if (!ack.ok) setActionError(ack.message ?? ack.error);
  };

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
            <p className="text-xs text-white/50">{sold} of {totalSpots} sold</p>
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

      {/* Randomize All (random format only) */}
      {brk.breakFormat === "random" && (
        <div className="px-3 py-3 border-b border-white/10">
          <button
            type="button"
            onClick={handleRandomizeAll}
            disabled
            title="Coming soon"
            className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-white/10 text-xs font-medium text-white/40 cursor-not-allowed"
          >
            <Zap className="h-3 w-3" />
            Randomize All
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-px rounded bg-white/10 text-white/50">
              Soon
            </span>
          </button>
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
              onStartAuction={brk.sellingMode === "auction" ? handleStartAuction : undefined}
              onSkip={handleSkipSpot}
              actionPending={actionPending}
            />
          ))
        )}
      </Section>

      {/* Awaiting Assignment (random format) */}
      {brk.breakFormat === "random" && (
        <Section
          title="Awaiting Assignment"
          count={awaitingAssignment.length}
          open={openSection.awaiting}
          onToggle={() => setOpenSection((s) => ({ ...s, awaiting: !s.awaiting }))}
        >
          {awaitingAssignment.length === 0 ? (
            <p className="text-xs text-white/40 px-3 py-2">Nothing waiting.</p>
          ) : (
            awaitingAssignment.map((spot) => (
              <div
                key={spot.id}
                className="px-3 py-2 flex items-center justify-between gap-2 border-b border-white/5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{spot.spotName}</p>
                  <p className="text-xs text-white/50 truncate">
                    Won by @{spot.winner?.username} · {formatCents(spot.soldPrice ?? 0)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleManualSpin(spot)}
                  disabled={actionPending === `spin-${spot.id}`}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-60"
                >
                  <Sparkles className="h-3 w-3" />
                  Spin
                </button>
              </div>
            ))
          )}
        </Section>
      )}

      {/* Assigned */}
      <Section
        title="Assigned"
        count={assigned.length}
        open={openSection.assigned}
        onToggle={() => setOpenSection((s) => ({ ...s, assigned: !s.assigned }))}
      >
        {assigned.length === 0 ? (
          <p className="text-xs text-white/40 px-3 py-2">No spots sold yet.</p>
        ) : (
          assigned.map((spot) => (
            <div
              key={spot.id}
              className="px-3 py-2 border-b border-white/5"
            >
              <p className="text-sm font-medium truncate">
                {spot.assignedName ?? spot.spotName}
              </p>
              <p className="text-xs text-white/50 truncate">
                @{spot.winner?.username} · {formatCents(spot.soldPrice ?? 0)}
              </p>
            </div>
          ))
        )}
      </Section>

      {/* Add Team placeholder */}
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
  onStartAuction,
  onSkip,
  actionPending,
}: {
  spot: Spot;
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
