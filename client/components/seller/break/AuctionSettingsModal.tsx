"use client";

import { useState } from "react";
import { Skull, Info } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

const COUNTER_BID_TIMES = [2, 3, 5, 7, 10] as const;
const DEFAULT_DURATION = 30;

export interface AuctionSettings {
  startingPrice: number; // cents
  suddenDeath: boolean;
  counterBidTime: number;
  initialDuration: number;
}

interface AuctionSettingsModalProps {
  open: boolean;
  onClose: () => void;
  defaultStartingPrice: number; // cents
  spotName: string;
  onConfirm: (settings: AuctionSettings) => Promise<void> | void;
}

export function AuctionSettingsModal(props: AuctionSettingsModalProps) {
  if (!props.open) return null;
  // Keying on spotName ensures fresh state when the seller opens settings on
  // a different spot — avoids the "reset state in effect" anti-pattern.
  return <AuctionSettingsModalContent key={props.spotName} {...props} />;
}

function AuctionSettingsModalContent({
  open,
  onClose,
  defaultStartingPrice,
  spotName,
  onConfirm,
}: AuctionSettingsModalProps) {
  const [suddenDeath, setSuddenDeath] = useState(false);
  const [startingPriceInput, setStartingPriceInput] = useState(
    (defaultStartingPrice / 100).toFixed(2)
  );
  const [counterBidTime, setCounterBidTime] = useState<number>(10);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    const cents = Math.max(1, Math.round(parseFloat(startingPriceInput || "1") * 100));
    setSubmitting(true);
    try {
      await onConfirm({
        startingPrice: cents,
        suddenDeath,
        counterBidTime,
        initialDuration: DEFAULT_DURATION,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Auction Settings"
      description={spotName}
      size="md"
      variant="dark"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-10 px-4 rounded-lg text-sm font-medium border border-white/15 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Starting…" : "Start Auction"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Format / Sudden Death */}
        <section>
          <h3 className="text-xs uppercase tracking-wider text-white/50 mb-2">Format</h3>
          <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-white/10 bg-white/5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Skull className="h-4 w-4" /> Sudden Death
              </p>
              <p className="text-xs text-white/50 mt-1 leading-snug">
                When the auction has 00:01 left, the next bidder wins instantly. Anti-snipe is
                disabled.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={suddenDeath}
              onClick={() => setSuddenDeath((v) => !v)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
                suddenDeath ? "bg-primary" : "bg-white/20"
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
                  suddenDeath ? "translate-x-[22px]" : "translate-x-0.5"
                )}
              />
            </button>
          </div>
        </section>

        {/* Settings */}
        <section>
          <h3 className="text-xs uppercase tracking-wider text-white/50 mb-2">Settings</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/60 mb-1">Starting Price</label>
              <div className="flex items-center h-11 rounded-lg border border-white/15 bg-white/5">
                <span className="pl-3 text-white/40">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={startingPriceInput}
                  onChange={(e) => setStartingPriceInput(e.target.value.replace(/[^\d.]/g, ""))}
                  className="flex-1 bg-transparent px-2 text-sm focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Time</label>
              <div className="flex items-center h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white/60">
                {DEFAULT_DURATION}s
              </div>
            </div>
          </div>
        </section>

        {/* Counter-Bid Time */}
        <section>
          <h3 className="text-xs uppercase tracking-wider text-white/50 mb-2 flex items-center gap-1">
            Counter-Bid Time <Info className="h-3 w-3 text-white/30" />
          </h3>
          <p className="text-xs text-white/50 mb-3">
            When the auction has less than 10 seconds remaining, any new bid will reset the timer
            to the selected amount. Disabled when Sudden Death is on.
          </p>
          <div className="flex gap-2 flex-wrap">
            {COUNTER_BID_TIMES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setCounterBidTime(t)}
                disabled={suddenDeath}
                className={cn(
                  "h-10 px-4 rounded-lg text-sm font-semibold border transition-colors",
                  counterBidTime === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-white/15 text-white/70 hover:bg-white/5",
                  suddenDeath && "opacity-40 cursor-not-allowed"
                )}
              >
                {t}s
              </button>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
