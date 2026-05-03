"use client";

import { useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import { ArrowDownAZ, ArrowUp01, Search, Sparkles, Gift } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { Break, Spot, AckResponse } from "@/lib/break-types";
import { spotTypeCopy } from "@/lib/break-types";
import { formatCents, shippingProfileLabel } from "@/lib/break-format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface SpotsListModalProps {
  open: boolean;
  onClose: () => void;
  break: Break | null;
  socket: Socket | null;
  walletBalanceCents: number;
  onTopUp: () => void;
}

type SortKey = "alpha" | "number" | "price";
type FilterKey = "all" | "available";

function emit<T>(socket: Socket | null, event: string, data: T): Promise<AckResponse> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve({ ok: false, error: "DISCONNECTED", message: "Not connected" });
      return;
    }
    socket.emit(event, data, (ack: AckResponse) => resolve(ack));
  });
}

function statusBadge(spot: Spot, isPickYour: boolean): React.ReactNode {
  // Random assignment modes: revealed = content known to everyone.
  if (!isPickYour && spot.isRevealedToBuyers) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full font-semibold">
        <Sparkles className="h-3 w-3" />
        Revealed
      </span>
    );
  }
  if (spot.winnerId) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Gift className="h-3 w-3" />
        Sold
      </span>
    );
  }
  if (spot.auctionStatus === "active") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-600 font-semibold">
        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
        Live · {formatCents(spot.currentBid ?? spot.startingBid ?? 0)}
      </span>
    );
  }
  if (spot.auctionStatus === "skipped") return <span className="text-xs text-muted-foreground">Skipped</span>;
  return <span className="text-xs text-muted-foreground">Available</span>;
}

/**
 * Pick the buyer-facing label for a spot. For pick-your, that's the spotName
 * (which is the team). For random, it's "Spot #N" until the auto-reveal flips
 * isRevealedToBuyers, after which the team becomes the headline.
 */
function spotHeadline(spot: Spot, isPickYour: boolean): string {
  if (isPickYour) return spot.spotName;
  if (spot.isRevealedToBuyers && spot.revealedTeam) return spot.revealedTeam;
  return spot.spotName; // "Spot #N"
}

export function SpotsListModal({
  open,
  onClose,
  break: brk,
  socket,
  walletBalanceCents,
  onTopUp,
}: SpotsListModalProps) {
  const { user } = useAuth();
  const [sort, setSort] = useState<SortKey>("number");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPickYour = brk?.assignmentMode === "pick_your";

  const spots = useMemo(() => {
    if (!brk) return [];
    let list = brk.spots;
    if (filter === "available") list = list.filter((s) => !s.winnerId && s.auctionStatus !== "skipped");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => {
        const headline = spotHeadline(s, brk.assignmentMode === "pick_your");
        return (
          headline.toLowerCase().includes(q) ||
          s.spotName.toLowerCase().includes(q)
        );
      });
    }
    const cmp = (a: Spot, b: Spot) => {
      if (sort === "alpha") return spotHeadline(a, !!isPickYour).localeCompare(spotHeadline(b, !!isPickYour));
      if (sort === "price") return (a.startingPrice ?? 0) - (b.startingPrice ?? 0);
      return a.spotNumber - b.spotNumber;
    };
    return [...list].sort(cmp);
  }, [brk, sort, filter, search, isPickYour]);

  if (!brk) return null;

  const isBuyNow = brk.sellingMode === "buy_it_now";
  const isOwnStream = false; // sellers don't see this modal in buyer mode
  const copy = spotTypeCopy(brk.spotType);

  const handleBuy = async (spot: Spot) => {
    setError(null);
    if (!user) {
      setError("Log in to buy a spot.");
      return;
    }
    if (walletBalanceCents < spot.startingPrice) {
      onTopUp();
      return;
    }
    setPendingId(spot.id);
    const ack = await emit(socket, "spot:buy_now", { spotId: spot.id });
    setPendingId(null);
    if (!ack.ok) {
      setError(ack.message ?? "Failed to claim spot.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isPickYour ? copy.pickVerb : "Pick a Spot"}
      description={brk.breakName}
      size="lg"
    >
      <div className="flex flex-col gap-4">
        {brk.breakDescription && (
          <p className="text-sm text-muted-foreground">{brk.breakDescription}</p>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Shipping profile: {shippingProfileLabel(brk.shippingProfile)}</span>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search spots..."
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 px-3 rounded-lg border border-input bg-background text-sm"
          >
            <option value="number"># Number</option>
            <option value="alpha">A–Z</option>
            <option value="price">Price</option>
          </select>

          <div className="inline-flex rounded-lg border border-input p-0.5">
            {(["all", "available"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn(
                  "px-3 h-8 text-xs font-medium rounded-md",
                  filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
                )}
              >
                {k === "all" ? "All" : "Available"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* List */}
        <div className="rounded-xl border border-border overflow-hidden">
          {spots.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No spots match.</p>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto divide-y divide-border">
              {spots.map((spot) => {
                const isMine = spot.winnerId === user?.id;
                const isLive = spot.auctionStatus === "active";
                const isSold = !!spot.winnerId;
                const canBuyNow = isBuyNow && !isSold && !isOwnStream;
                const headline = spotHeadline(spot, !!isPickYour);
                // For random spots, the winner gets to see their team even
                // before the public reveal — surface that prominently.
                const winnerTeam =
                  !isPickYour && isMine && spot.revealedTeam && !spot.isRevealedToBuyers
                    ? spot.revealedTeam
                    : null;
                return (
                  <div
                    key={spot.id}
                    className={cn(
                      "p-3",
                      isMine && "bg-yellow-50 border-l-2 border-yellow-300"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{headline}</p>
                        {spot.winnerId && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {isMine ? (
                              <span className="font-semibold text-yellow-700">You won this!</span>
                            ) : (
                              <>Won by @{spot.winner?.username}</>
                            )}
                          </p>
                        )}
                      </div>
                      {statusBadge(spot, !!isPickYour)}
                    </div>

                    {/* Personal preview for the winner before public reveal */}
                    {winnerTeam && (
                      <div className="mt-2 rounded-lg bg-yellow-100 border border-yellow-300 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wider text-yellow-700 mb-0.5">
                          Your {copy.singular} (hidden until reveal)
                        </p>
                        <p className="text-sm font-bold text-yellow-900">{winnerTeam}</p>
                      </div>
                    )}

                    {/* Public reveal callout */}
                    {!isPickYour && spot.isRevealedToBuyers && spot.revealedTeam && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Spot #{spot.spotNumber}
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-muted-foreground">
                        {isBuyNow
                          ? `Price: ${formatCents(spot.soldPrice ?? spot.startingPrice)}`
                          : isSold
                            ? `Final: ${formatCents(spot.soldPrice ?? 0)}`
                            : `Starting: ${formatCents(spot.startingPrice)}`}
                        {spot.bidCount > 0 ? ` · ${spot.bidCount} bid${spot.bidCount === 1 ? "" : "s"}` : ""}
                      </p>

                      {canBuyNow && (
                        <button
                          type="button"
                          onClick={() => handleBuy(spot)}
                          disabled={pendingId === spot.id}
                          className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-60"
                        >
                          {pendingId === spot.id
                            ? "Buying…"
                            : walletBalanceCents < spot.startingPrice
                              ? "Top up"
                              : `Buy ${formatCents(spot.startingPrice)}`}
                        </button>
                      )}

                      {!isBuyNow && isLive && (
                        <span className="text-xs font-semibold text-red-600">
                          Bid below
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          {isBuyNow ? <ArrowUp01 className="inline h-3 w-3 mr-1" /> : <ArrowDownAZ className="inline h-3 w-3 mr-1" />}
          {spots.length} spots · {brk.spots.filter((s) => !s.winnerId).length} available
        </p>
      </div>
    </Modal>
  );
}
