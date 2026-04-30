"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { TopUpModal } from "@/components/wallet/TopUpModal";
import { TransactionList } from "@/components/wallet/TransactionList";
import { apiFetch } from "@/lib/api";
import { Wallet } from "lucide-react";

export default function WalletPage() {
  const { user, isLoading, refreshUser } = useAuth();
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    const loadBalance = async () => {
      try {
        const res = await apiFetch("/wallet/balance");
        if (res.ok) {
          const data = await res.json();
          setBalance(data.balance);
        }
      } catch {
        // Failed
      }
    };
    loadBalance();
  }, [user, refreshKey]);

  if (isLoading || !user) {
    return null;
  }

  const handleTopUpSuccess = async () => {
    await refreshUser();
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 max-w-2xl mx-auto w-full p-6">
        {/* Balance Card */}
        <div className="rounded-xl border border-border p-6 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Wallet className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-semibold">Your Wallet</h1>
          </div>
          <p className="text-4xl font-bold mb-4">
            ${balance !== null ? (balance / 100).toFixed(2) : "..."}
          </p>
          <TopUpModal onSuccess={handleTopUpSuccess}>
            <button className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
              Add Funds
            </button>
          </TopUpModal>
        </div>

        {/* Transaction History */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Transaction History</h2>
          <TransactionList key={refreshKey} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
