"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Transaction {
  id: string;
  type: string;
  amountCents: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

export function TransactionList() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch("/wallet/transactions");
        if (res.ok) {
          const data = await res.json();
          setTransactions(data.transactions);
        }
      } catch {
        // Failed to load
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading transactions...</p>
    );
  }

  if (transactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No transactions yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {transactions.map((txn) => (
        <div
          key={txn.id}
          className="flex items-center justify-between p-3 rounded-lg border border-border"
        >
          <div>
            <p className="text-sm font-medium">{txn.description}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(txn.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
          <div className="text-right">
            <p
              className={`text-sm font-semibold ${
                txn.amountCents > 0 ? "text-green-600" : "text-red-500"
              }`}
            >
              {txn.amountCents > 0 ? "+" : ""}$
              {(txn.amountCents / 100).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              Balance: ${(txn.balanceAfter / 100).toFixed(2)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
