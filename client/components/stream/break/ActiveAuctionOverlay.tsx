"use client";

import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { Wallet } from "lucide-react";
import Image from "next/image";
import type { Break, Spot, AckResponse } from "@/lib/break-types";
import { formatCentsCompact, formatTimer, nextMinBidCents } from "@/lib/break-format";
import { useAuth } from "@/hooks/useAuth";
import { CustomBidModal } from "./CustomBidModal";
import { cn } from "@/lib/utils";

interface ActiveAuctionOverlayProps {
  breakItem: Break;
  spot: Spot;
  socket: Socket | null;
  walletBalanceCents: number;
  onTopUp: () => void;
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

export function ActiveAuctionOverlay({
  breakItem,
  spot,
  socket,
  walletBalanceCents,
  onTopUp,
}: ActiveAuctionOverlayProps) {
  const { user } = useAuth();
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [flash, setFlash] = useState<"none" | "success" | "error">("none");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);

  useEffect(() => {
    if (!spot.auctionEndsAt) return;
    const tick = () => {
      const ms = new Date(spot.auctionEndsAt!).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [spot.auctionEndsAt]);

  const minBid = nextMinBidCents(spot);
  const isHighBidder = user?.id === spot.highBidderId;
  const isOwn = false; // sellers don't see this overlay; placeholder
  const insufficient = !isHighBidder && walletBalanceCents < minBid;
  const auctionEnded = secondsLeft <= 0;

  const placeBid = async (amount: number) => {
    if (!user) return;
    setPlacing(true);
    setErrorMsg(null);
    const ack = await emit(socket, "bid:place", { spotId: spot.id, amount });
    setPlacing(false);
    if (ack.ok) {
      setFlash("success");
      setTimeout(() => setFlash("none"), 600);
    } else {
      setFlash("error");
      const msg =
        ack.error === "INSUFFICIENT_FUNDS"
          ? "Insufficient funds — top up your wallet."
          : ack.message ?? "Bid failed.";
      setErrorMsg(msg);
      setTimeout(() => setFlash("none"), 600);
      if (ack.error === "INSUFFICIENT_FUNDS") onTopUp();
      throw new Error(msg);
    }
  };

  const handleTapBid = async () => {
    if (insufficient) {
      onTopUp();
      return;
    }
    try {
      await placeBid(minBid);
    } catch {
      // already toasted via flash + errorMsg
    }
  };

  const formatLabel = breakItem.breakFormat === "pick_your" ? "Pick Your Team" : "Random Team";

  return (
    <>
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 px-4 pb-4 pt-12 bg-gradient-to-t from-black/95 via-black/70 to-transparent transition-colors",
          flash === "success" && "bg-green-500/30",
          flash === "error" && "bg-red-500/30"
        )}
      >
        {/* Format badge */}
        <span className="inline-flex items-center gap-1 bg-white/15 backdrop-blur text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">
          {formatLabel}
        </span>

        {/* Winning chip */}
        {spot.highBidder && (
          <div className="mt-2 inline-flex items-center gap-2 bg-black/40 backdrop-blur rounded-full pl-1 pr-3 py-0.5">
            {spot.highBidder.avatarUrl ? (
              <Image
                src={spot.highBidder.avatarUrl}
                alt=""
                width={24}
                height={24}
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <span className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                {spot.highBidder.username.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="text-white text-xs">
              <strong>@{spot.highBidder.username}</strong> is{" "}
              <span className="text-primary font-bold">Winning!</span>
            </span>
          </div>
        )}

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-white text-lg font-bold truncate">
              {breakItem.breakName} — {spot.spotName}
            </p>
            <p className="text-white/70 text-xs">
              {spot.bidCount} {spot.bidCount === 1 ? "Bid" : "Bids"} · Shipping included
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-white text-2xl font-bold leading-none">
              {formatCentsCompact(spot.currentBid ?? spot.startingBid ?? 0)}
            </p>
            <p
              className={cn(
                "font-mono text-base mt-0.5",
                secondsLeft <= 5 && !spot.suddenDeath
                  ? "text-red-400 animate-pulse"
                  : "text-primary"
              )}
            >
              {formatTimer(secondsLeft)}
            </p>
          </div>
        </div>

        {/* Sudden death badge */}
        {spot.suddenDeath && (
          <p className="mt-1 text-[11px] text-red-300 font-semibold uppercase tracking-wider">
            Sudden Death
          </p>
        )}

        {/* Bid actions */}
        {user && !auctionEnded && (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              disabled={placing || isHighBidder || isOwn}
              className="px-4 h-11 rounded-full bg-white text-foreground text-sm font-semibold hover:bg-white/90 disabled:opacity-50"
            >
              Custom
            </button>
            <button
              type="button"
              onClick={handleTapBid}
              disabled={placing || isHighBidder || isOwn}
              className={cn(
                "flex-1 h-11 rounded-full text-sm font-bold transition-colors",
                isHighBidder
                  ? "bg-green-500 text-white"
                  : insufficient
                    ? "bg-white text-foreground border border-foreground/20"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                placing && "opacity-70"
              )}
            >
              {isHighBidder ? (
                <span className="inline-flex items-center justify-center gap-1.5">You are winning</span>
              ) : insufficient ? (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <Wallet className="h-4 w-4" />
                  Top up to bid
                </span>
              ) : placing ? (
                "Placing…"
              ) : (
                `Bid ${formatCentsCompact(minBid)}`
              )}
            </button>
          </div>
        )}

        {!user && (
          <a
            href="/login"
            className="mt-3 block w-full text-center h-11 rounded-full bg-primary text-primary-foreground text-sm font-bold leading-[44px]"
          >
            Log in to bid
          </a>
        )}

        {auctionEnded && (
          <p className="mt-3 text-center text-white/70 text-sm">
            {spot.highBidder ? `Sold to @${spot.highBidder.username}` : "No bids — auction ended"}
          </p>
        )}

        {errorMsg && (
          <p className="mt-2 text-xs text-red-300 text-center">{errorMsg}</p>
        )}
      </div>

      <CustomBidModal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        minBidCents={minBid}
        maxBidCents={walletBalanceCents}
        spotName={spot.spotName}
        onSubmit={placeBid}
      />
    </>
  );
}
