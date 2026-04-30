"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
);

const PRESET_AMOUNTS = [
  { label: "$25", cents: 2500 },
  { label: "$50", cents: 5000 },
  { label: "$100", cents: 10000 },
  { label: "$250", cents: 25000 },
];

function CheckoutForm({
  onSuccess,
  amountCents,
  onBack,
}: {
  onSuccess: () => void;
  amountCents: number;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError("");

    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (result.error) {
      setError(result.error.message || "Payment failed");
      setLoading(false);
    } else {
      onSuccess();
    }
  };

  return (
    // Two-zone layout: scrollable Stripe Elements at the top, sticky pay-bar at
    // the bottom so the Pay button is always reachable no matter how tall the
    // PaymentElement gets (Card + Cash App + Amazon Pay etc.).
    <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 overflow-y-auto -mx-4 px-4 pb-4">
        <PaymentElement />
        {error && (
          <div className="mt-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}
      </div>
      <div className="-mx-4 -mb-4 px-4 py-3 border-t border-border bg-popover flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="h-10 px-4 rounded-lg border border-border text-sm font-medium hover:bg-secondary disabled:opacity-50 transition-colors"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!stripe || loading}
          className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? "Processing…" : `Pay $${(amountCents / 100).toFixed(2)}`}
        </button>
      </div>
    </form>
  );
}

interface TopUpModalProps {
  onSuccess?: () => void;
  children: React.ReactNode;
}

export function TopUpModal({ onSuccess, children }: TopUpModalProps) {
  const [open, setOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAmountSelect = async (cents: number) => {
    setSelectedAmount(cents);
    setError("");
    setLoading(true);

    try {
      const res = await apiFetch("/wallet/topup", {
        method: "POST",
        body: JSON.stringify({ amountCents: cents }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to create payment");
      }
      const data = await res.json();
      setClientSecret(data.clientSecret);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to create payment"
      );
      setSelectedAmount(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomAmount = () => {
    const dollars = parseFloat(customAmount);
    if (isNaN(dollars) || dollars < 1 || dollars > 1000) {
      setError("Enter an amount between $1 and $1,000");
      return;
    }
    handleAmountSelect(Math.round(dollars * 100));
  };

  const handleSuccess = () => {
    setOpen(false);
    setClientSecret(null);
    setSelectedAmount(null);
    setCustomAmount("");
    onSuccess?.();
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setClientSecret(null);
      setSelectedAmount(null);
      setCustomAmount("");
      setError("");
    }
  };

  const handleBackToAmounts = () => {
    setClientSecret(null);
    setSelectedAmount(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={children as React.ReactElement} />
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Add Funds</DialogTitle>
        </DialogHeader>

        {!clientSecret ? (
          <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              {PRESET_AMOUNTS.map((amt) => (
                <button
                  key={amt.cents}
                  onClick={() => handleAmountSelect(amt.cents)}
                  disabled={loading}
                  className="h-12 rounded-lg border border-border font-semibold hover:bg-secondary disabled:opacity-50 transition-colors"
                >
                  {amt.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Custom amount"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                min="1"
                max="1000"
                step="0.01"
                className="flex-1 h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={handleCustomAmount}
                disabled={loading || !customAmount}
                className="px-4 h-10 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                Go
              </button>
            </div>

            {loading && (
              <p className="text-sm text-muted-foreground text-center">
                Creating payment...
              </p>
            )}
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}
          </div>
        ) : (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret, appearance: { theme: "stripe" } }}
          >
            <CheckoutForm
              onSuccess={handleSuccess}
              onBack={handleBackToAmounts}
              amountCents={selectedAmount ?? 0}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}
