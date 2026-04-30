"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Socket } from "socket.io-client";
import {
  Sparkles,
  Pin,
  PinOff,
  SkipForward,
  Pencil,
  PartyPopper,
  ChevronRight,
  Loader2,
  Trophy,
  ShoppingBag,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/break-format";
import type { Break, Spot, AckResponse } from "@/lib/break-types";

interface RevealModePanelProps {
  break: Break;
  socket: Socket | null;
}

function emit<T>(socket: Socket | null, event: string, data: T): Promise<AckResponse> {
  return new Promise((resolve) => {
    if (!socket) return resolve({ ok: false, error: "DISCONNECTED", message: "Not connected" });
    socket.emit(event, data, (ack: AckResponse) => resolve(ack));
  });
}

export function RevealModePanel({ break: brk, socket }: RevealModePanelProps) {
  const router = useRouter();
  const sortedSpots = useMemo(() => {
    return [...brk.spots]
      .filter((s) => s.winnerId)
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return a.spotNumber - b.spotNumber;
      });
  }, [brk.spots]);

  const currentSpot = sortedSpots.find((s) => s.revealStatus === "revealing") ?? null;
  const upNext = sortedSpots.filter((s) => s.revealStatus === "pending");
  const skipped = sortedSpots.filter((s) => s.revealStatus === "skipped");
  const revealed = sortedSpots
    .filter((s) => s.revealStatus === "revealed")
    .sort((a, b) => (a.revealOrder ?? 0) - (b.revealOrder ?? 0));

  const total = sortedSpots.length;
  const revealedCount = revealed.length;
  const progress = total > 0 ? (revealedCount / total) * 100 : 0;

  const isCompleted = brk.status === "completed";
  const totalSalesCents = sortedSpots.reduce((sum, s) => sum + (s.soldPrice ?? 0), 0);
  const uniqueBuyers = new Set(sortedSpots.map((s) => s.winnerId)).size;

  if (isCompleted) {
    return (
      <div className="flex flex-col h-full text-white p-4">
        <div className="flex flex-col items-center text-center mt-2 mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground mb-3 shadow-[0_0_30px_rgba(255,214,0,0.5)]">
            <Trophy className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold">Break Complete!</h2>
          <p className="text-sm text-white/60 mt-1">
            {revealedCount} {revealedCount === 1 ? "spot" : "spots"} revealed across {uniqueBuyers}{" "}
            {uniqueBuyers === 1 ? "buyer" : "buyers"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-6">
          <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-white/50">Total Sales</p>
            <p className="text-xl font-bold text-primary mt-0.5">{formatCents(totalSalesCents)}</p>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-white/50">Revealed</p>
            <p className="text-xl font-bold mt-0.5">
              {revealedCount}
              <span className="text-white/30 text-base">/{total}</span>
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
              // Trigger the seller's "Add a Product" menu via window event so
              // the parent BroadcasterView can open the create-break modal.
              window.dispatchEvent(new CustomEvent("seller:open-create-break"));
            }}
            className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-lg border border-white/15 text-sm font-medium hover:bg-white/5 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Another Break
          </button>
        </div>

        {revealed.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-black/20 max-h-72 overflow-y-auto">
            <p className="px-3 py-2 text-xs uppercase tracking-wider text-white/50 border-b border-white/10">
              Reveals ({revealed.length})
            </p>
            {revealed.map((s) => (
              <div key={s.id} className="px-3 py-2 border-b border-white/5">
                <p className="text-xs text-white/50">
                  Spot #{s.spotNumber} → @{s.winner?.username ?? "?"}
                </p>
                <p className="text-sm font-semibold text-primary truncate">{s.revealText}</p>
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
        <p className="text-xs uppercase tracking-wider text-primary flex items-center gap-1.5">
          <PartyPopper className="h-3.5 w-3.5" />
          Reveal Mode
        </p>
        <p className="text-sm font-semibold truncate" title={brk.breakName}>
          {brk.breakName}
        </p>
        <div className="mt-2">
          <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-white/60">
            Spot {Math.min(revealedCount + 1, total)} of {total}
            <span className="ml-1.5 text-white/40">·</span>
            <span className="ml-1.5">{total - revealedCount} remaining</span>
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Currently revealing */}
        {currentSpot ? (
          <CurrentRevealCard spot={currentSpot} socket={socket} />
        ) : (
          <div className="px-3 py-6 text-center">
            <Loader2 className="h-5 w-5 mx-auto animate-spin text-white/40 mb-2" />
            <p className="text-xs text-white/50">
              {revealedCount === total
                ? "Wrapping up the break…"
                : "Picking the next spot…"}
            </p>
          </div>
        )}

        {/* Up next */}
        {upNext.length > 0 && (
          <Section title="Up Next" count={upNext.length}>
            {upNext.slice(0, 8).map((s) => (
              <UpNextRow key={s.id} spot={s} socket={socket} disabled={!!currentSpot} />
            ))}
            {upNext.length > 8 && (
              <p className="px-3 py-2 text-[11px] text-white/40">
                + {upNext.length - 8} more
              </p>
            )}
          </Section>
        )}

        {/* Skipped */}
        {skipped.length > 0 && (
          <Section title="Skipped" count={skipped.length}>
            {skipped.map((s) => (
              <UpNextRow key={s.id} spot={s} socket={socket} disabled={!!currentSpot} skipped />
            ))}
          </Section>
        )}

        {/* Revealed */}
        {revealed.length > 0 && (
          <Section title="Already Revealed" count={revealed.length} collapsible>
            {revealed.map((s) => (
              <RevealedRow key={s.id} spot={s} socket={socket} />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function CurrentRevealCard({
  spot,
  socket,
}: {
  spot: Spot;
  socket: Socket | null;
}) {
  // Force-remount the editable card per spot so state resets cleanly.
  return <CurrentRevealCardInner key={spot.id} spot={spot} socket={socket} />;
}

function CurrentRevealCardInner({
  spot,
  socket,
}: {
  spot: Spot;
  socket: Socket | null;
}) {
  const [revealText, setRevealText] = useState("");
  const [submitting, setSubmitting] = useState<"confirm" | "skip" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleConfirm = async () => {
    const text = revealText.trim();
    if (!text) {
      setError("Type what they got first.");
      return;
    }
    setSubmitting("confirm");
    setError(null);
    const ack = await emit(socket, "seller:confirm_reveal", {
      spotId: spot.id,
      revealText: text,
    });
    setSubmitting(null);
    if (!ack.ok) setError(ack.message ?? ack.error);
  };

  const handleSkip = async () => {
    setSubmitting("skip");
    setError(null);
    const ack = await emit(socket, "seller:skip_reveal", { spotId: spot.id });
    setSubmitting(null);
    if (!ack.ok) setError(ack.message ?? ack.error);
  };

  return (
    <div className="m-3 rounded-2xl border-2 border-primary/40 bg-primary/5 p-4 shadow-[0_0_30px_-15px_rgba(255,214,0,0.5)]">
      <span className="inline-flex items-center gap-1 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
        <span className="w-1.5 h-1.5 bg-primary-foreground rounded-full" />
        Currently Revealing
      </span>

      <div className="mt-3">
        <p className="text-2xl font-bold">Spot #{spot.spotNumber}</p>
        <p className="text-sm text-white/70 mt-0.5">
          Winner: <span className="font-semibold text-white">@{spot.winner?.username ?? "?"}</span>
        </p>
      </div>

      <div className="mt-4">
        <label className="block text-xs text-white/60 mb-1.5">What did they get?</label>
        <input
          ref={inputRef}
          type="text"
          value={revealText}
          onChange={(e) => {
            setRevealText(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && revealText.trim()) {
              void handleConfirm();
            }
          }}
          maxLength={120}
          placeholder="e.g. Charizard ex Holo"
          className="w-full h-11 px-3 rounded-lg border border-white/15 bg-black/30 text-base text-white placeholder:text-white/30 focus:outline-none focus:border-primary"
        />
        <p className="mt-1 text-[10px] text-white/40 text-right">
          {revealText.length}/120
        </p>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-300">{error}</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSkip}
          disabled={!!submitting}
          className="h-10 px-4 rounded-lg text-sm font-medium border border-white/15 hover:bg-white/5 disabled:opacity-50"
        >
          {submitting === "skip" ? "Skipping…" : "Skip Spot"}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!!submitting || !revealText.trim()}
          className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
        >
          {submitting === "confirm" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Revealing…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Confirm Reveal
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function UpNextRow({
  spot,
  socket,
  disabled,
  skipped,
}: {
  spot: Spot;
  socket: Socket | null;
  disabled: boolean;
  skipped?: boolean;
}) {
  const [pending, setPending] = useState<string | null>(null);

  const handlePin = async () => {
    setPending("pin");
    await emit(socket, "seller:toggle_pin", { spotId: spot.id });
    setPending(null);
  };

  const handleStart = async () => {
    setPending("start");
    await emit(socket, "seller:start_reveal", { spotId: spot.id });
    setPending(null);
  };

  return (
    <div className="px-3 py-2 flex items-center gap-2 border-b border-white/5 hover:bg-white/5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          Spot #{spot.spotNumber} → @{spot.winner?.username ?? "?"}
        </p>
        {skipped && (
          <p className="text-[10px] text-amber-400 uppercase tracking-wider">Skipped</p>
        )}
      </div>
      <button
        type="button"
        onClick={handlePin}
        disabled={pending !== null}
        title={spot.isPinned ? "Unpin" : "Pin to reveal next"}
        className={cn(
          "p-1.5 rounded transition-colors",
          spot.isPinned
            ? "bg-primary/20 text-primary"
            : "text-white/40 hover:text-white hover:bg-white/10"
        )}
      >
        {spot.isPinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={handleStart}
        disabled={disabled || pending !== null}
        title={disabled ? "Finish current reveal first" : "Reveal this spot now"}
        className="p-1.5 rounded text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <SkipForward className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function RevealedRow({
  spot,
  socket,
}: {
  spot: Spot;
  socket: Socket | null;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(spot.revealText ?? "");
  const [pending, setPending] = useState<string | null>(null);

  const handleSaveEdit = async () => {
    const text = editText.trim();
    if (!text) return;
    setPending("edit");
    const ack = await emit(socket, "seller:confirm_reveal", {
      spotId: spot.id,
      revealText: text,
    });
    setPending(null);
    if (ack.ok) setEditing(false);
  };

  const handleRebroadcast = async () => {
    setPending("rebroadcast");
    await emit(socket, "seller:rebroadcast_reveal", { spotId: spot.id });
    setPending(null);
  };

  return (
    <div className="px-3 py-2 border-b border-white/5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">
            Spot #{spot.spotNumber} → @{spot.winner?.username ?? "?"}
          </p>
          {!editing ? (
            <p className="text-sm text-primary font-semibold truncate">
              {spot.revealText}
            </p>
          ) : (
            <div className="mt-1 flex gap-1">
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                maxLength={120}
                className="flex-1 h-8 px-2 rounded border border-white/15 bg-black/30 text-xs text-white focus:outline-none focus:border-primary"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
              />
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={pending === "edit"}
                className="h-8 px-2 rounded bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setEditText(spot.revealText ?? "");
                }}
                className="h-8 px-2 rounded border border-white/15 text-[11px]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Edit reveal text"
              className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleRebroadcast}
              disabled={pending === "rebroadcast"}
              title="Re-broadcast confetti for buyer"
              className="p-1 rounded text-white/40 hover:text-primary hover:bg-primary/10"
            >
              <PartyPopper className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  collapsible,
  children,
}: {
  title: string;
  count: number;
  collapsible?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-t border-white/10">
      <button
        type="button"
        onClick={() => collapsible && setOpen((o) => !o)}
        disabled={!collapsible}
        className={cn(
          "flex items-center justify-between w-full px-3 py-2 text-xs uppercase tracking-wider text-white/60",
          collapsible && "hover:bg-white/5"
        )}
      >
        <span className="flex items-center gap-1.5">
          {collapsible && (
            <ChevronRight
              className={cn("h-3 w-3 transition-transform", open && "rotate-90")}
            />
          )}
          {title}
        </span>
        <span className="text-white/40">({count})</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}
