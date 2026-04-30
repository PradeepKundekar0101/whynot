"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet,
  Clock,
  TrendingUp,
  Send,
  AlertCircle,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { cn } from "@/lib/utils";

interface EarningsSummary {
  availableCents: number;
  pendingCents: number;
  lifetimeCents: number;
  minPayoutCents: number;
  payoutMethodReady: boolean;
  nextEscrowReleaseAt: string | null;
}

interface EarningsTxn {
  id: string;
  type: string;
  amountCents: number;
  pendingBalanceAfter: number;
  availableBalanceAfter: number;
  description: string;
  orderId: string | null;
  createdAt: string;
}

interface PayoutRow {
  id: string;
  amountCents: number;
  status: string;
  stripeTransferId: string | null;
  failedReason: string | null;
  requestedAt: string;
  processedAt: string | null;
}

function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const TXN_LABEL: Record<string, string> = {
  sale_pending: "Sale pending",
  sale_released: "Funds released",
  refund: "Refund",
  payout_requested: "Payout requested",
  payout_completed: "Payout completed",
  payout_failed: "Payout failed",
};

const PAYOUT_BADGE: Record<string, { label: string; className: string }> = {
  requested: { label: "Requested", className: "bg-amber-100 text-amber-700" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-700" },
  paid: { label: "Paid", className: "bg-green-100 text-green-700" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700" },
};

export default function SellerEarningsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [transactions, setTransactions] = useState<EarningsTxn[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllTxns, setShowAllTxns] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sRes, tRes, pRes] = await Promise.all([
        apiFetch("/seller/earnings"),
        apiFetch("/seller/earnings/transactions"),
        apiFetch("/seller/payouts"),
      ]);
      if (sRes.ok) setSummary(await sRes.json());
      if (tRes.ok) setTransactions((await tRes.json()).transactions ?? []);
      if (pRes.ok) setPayouts((await pRes.json()).payouts ?? []);
    } catch {
      setError("Failed to load earnings");
    }
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (!user.isSellerEnabled) {
      router.push("/");
      return;
    }
    // load() updates state from the API — this IS the canonical "fetch on mount" pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [user, isLoading, router, load]);

  // Refresh every 5s while a payout is processing so the UI catches the status flip.
  useEffect(() => {
    const hasInFlight = payouts.some(
      (p) => p.status === "requested" || p.status === "processing"
    );
    if (!hasInFlight) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [payouts, load]);

  const handleRequestPayout = async () => {
    if (!summary) return;
    setError(null);
    setRequestingPayout(true);
    try {
      const res = await apiFetch("/seller/payouts/request", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.message ?? "Payout request failed.");
        return;
      }
      await load();
    } finally {
      setRequestingPayout(false);
    }
  };

  if (isLoading || !user || !summary) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading earnings…</p>
        </main>
      </div>
    );
  }

  const canPayout =
    summary.availableCents >= summary.minPayoutCents && !requestingPayout;

  const visibleTxns = showAllTxns ? transactions : transactions.slice(0, 10);

  return (
    <div className="flex flex-col min-h-screen bg-[#FAFAFA]">
      <Navbar />
      <main className="flex-1 max-w-5xl mx-auto w-full p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Earnings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your sales, escrow holds, and payouts.
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-px shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {/* Available */}
          <div className="rounded-2xl border-2 border-primary/30 bg-white p-5">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-4 w-4 text-primary" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Available</p>
            </div>
            <p className="text-3xl font-extrabold">{formatCents(summary.availableCents)}</p>
            <button
              type="button"
              onClick={handleRequestPayout}
              disabled={!canPayout}
              title={
                canPayout
                  ? undefined
                  : `Minimum payout is ${formatCents(summary.minPayoutCents)}`
              }
              className="mt-4 w-full inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
            >
              <Send className="h-4 w-4" />
              {requestingPayout ? "Requesting…" : "Request Payout"}
            </button>
            {summary.availableCents < summary.minPayoutCents && (
              <p className="mt-2 text-[11px] text-muted-foreground text-center">
                Minimum payout is {formatCents(summary.minPayoutCents)}
              </p>
            )}
          </div>

          {/* Pending */}
          <div className="rounded-2xl border border-border bg-white p-5">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Pending</p>
            </div>
            <p className="text-3xl font-extrabold">{formatCents(summary.pendingCents)}</p>
            <p className="mt-3 text-xs text-muted-foreground leading-snug">
              Held in escrow during the buyer-protection window.
            </p>
            {summary.nextEscrowReleaseAt && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Next release: {formatDateTime(summary.nextEscrowReleaseAt)}
              </p>
            )}
          </div>

          {/* Lifetime */}
          <div className="rounded-2xl border border-border bg-white p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Lifetime</p>
            </div>
            <p className="text-3xl font-extrabold">{formatCents(summary.lifetimeCents)}</p>
            <p className="mt-3 text-xs text-muted-foreground">Total earnings released to date.</p>
          </div>
        </div>

        {/* Recent payouts */}
        {payouts.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold mb-3">Recent payouts</h2>
            <div className="rounded-xl border border-border bg-white divide-y divide-border overflow-hidden">
              {payouts.slice(0, 5).map((p) => {
                const badge = PAYOUT_BADGE[p.status] ?? {
                  label: p.status,
                  className: "bg-secondary text-muted-foreground",
                };
                return (
                  <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{formatCents(p.amountCents)}</p>
                      <p className="text-xs text-muted-foreground">
                        Requested {formatDateTime(p.requestedAt)}
                        {p.processedAt && ` · paid ${formatDateTime(p.processedAt)}`}
                      </p>
                      {p.failedReason && (
                        <p className="text-xs text-destructive mt-0.5">{p.failedReason}</p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[11px] font-semibold px-2 py-0.5 rounded-full",
                        badge.className
                      )}
                    >
                      {badge.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Transaction history */}
        <section>
          <h2 className="text-sm font-semibold mb-3">Recent transactions</h2>
          {transactions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-white p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No earnings activity yet. Sell your first spot to get started.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-white divide-y divide-border overflow-hidden">
              {visibleTxns.map((t) => {
                const isPositive = t.amountCents > 0;
                const isOutbound = t.type === "payout_requested";
                return (
                  <div
                    key={t.id}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span
                        className={cn(
                          "shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
                          isOutbound
                            ? "bg-orange-100 text-orange-700"
                            : isPositive
                              ? "bg-green-100 text-green-700"
                              : "bg-secondary text-muted-foreground"
                        )}
                      >
                        {isOutbound ? (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDownLeft className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight">
                          {TXN_LABEL[t.type] ?? t.type}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {t.description}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDateTime(t.createdAt)}
                        </p>
                      </div>
                    </div>
                    <p
                      className={cn(
                        "text-sm font-semibold tabular-nums shrink-0",
                        t.amountCents === 0
                          ? "text-muted-foreground"
                          : isPositive
                            ? "text-green-700"
                            : "text-orange-700"
                      )}
                    >
                      {t.amountCents === 0
                        ? "—"
                        : `${isPositive ? "+" : ""}${formatCents(t.amountCents)}`}
                    </p>
                  </div>
                );
              })}
              {transactions.length > 10 && (
                <button
                  type="button"
                  onClick={() => setShowAllTxns((v) => !v)}
                  className="w-full px-4 py-3 text-sm font-medium text-center hover:bg-secondary/50 transition-colors flex items-center justify-center gap-1.5"
                >
                  {showAllTxns ? (
                    <>
                      <ChevronUp className="h-4 w-4" /> Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" /> Show all {transactions.length}
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
