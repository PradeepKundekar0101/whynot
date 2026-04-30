"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";

interface CustomBidModalProps {
  open: boolean;
  onClose: () => void;
  minBidCents: number;
  maxBidCents: number; // available wallet balance
  spotName: string;
  onSubmit: (cents: number) => Promise<void> | void;
}

export function CustomBidModal(props: CustomBidModalProps) {
  if (!props.open) return null;
  return <CustomBidModalContent key={`${props.spotName}-${props.minBidCents}`} {...props} />;
}

function CustomBidModalContent({
  open,
  onClose,
  minBidCents,
  maxBidCents,
  spotName,
  onSubmit,
}: CustomBidModalProps) {
  const [value, setValue] = useState((minBidCents / 100).toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const cleaned = value.replace(/[^\d.]/g, "");
    const dollars = parseFloat(cleaned);
    if (isNaN(dollars)) {
      setError("Enter a valid amount.");
      return;
    }
    const cents = Math.round(dollars * 100);
    if (cents < minBidCents) {
      setError(`Minimum bid is $${(minBidCents / 100).toFixed(2)}.`);
      return;
    }
    if (cents > maxBidCents) {
      setError(`You only have $${(maxBidCents / 100).toFixed(2)} available.`);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(cents);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place bid.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Custom Bid"
      description={spotName}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-10 px-4 rounded-lg text-sm font-medium hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Placing…" : "Place Bid"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Minimum bid: <span className="font-semibold text-foreground">${(minBidCents / 100).toFixed(2)}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Available balance: <span className="font-semibold text-foreground">${(maxBidCents / 100).toFixed(2)}</span>
        </p>
        <div className="flex items-center h-12 rounded-lg border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-primary">
          <span className="pl-3 text-muted-foreground text-lg">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSubmit();
            }}
            autoFocus
            className="flex-1 px-2 bg-transparent text-lg font-semibold focus:outline-none"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}
