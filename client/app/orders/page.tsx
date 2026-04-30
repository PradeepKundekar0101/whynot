"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { apiFetch } from "@/lib/api";

interface Order {
  id: string;
  type: string;
  amountCents: number;
  description: string;
  createdAt: string;
}

export default function OrdersPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const res = await apiFetch("/wallet/transactions?limit=100");
        if (res.ok) {
          const data = await res.json();
          // Filter to only purchases and refunds (not topups)
          setOrders(data.transactions.filter((t: Order) => t.type === "purchase" || t.type === "refund"));
        }
      } catch {} finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  if (isLoading || !user) return null;

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 max-w-2xl mx-auto w-full p-6">
        <h1 className="text-2xl font-bold mb-6">Your Orders</h1>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading orders...</p>
        ) : orders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-lg font-semibold mb-2">No orders yet</p>
            <p className="text-sm text-muted-foreground">
              Your purchases from auctions and breaks will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(order => (
              <div key={order.id} className="flex items-center justify-between p-4 rounded-xl border border-border">
                <div>
                  <p className="text-sm font-medium">{order.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                      hour: "numeric", minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className={`text-sm font-semibold ${
                  order.type === "refund" ? "text-green-600" : "text-foreground"
                }`}>
                  {order.type === "refund" ? "+" : ""}${(Math.abs(order.amountCents) / 100).toFixed(2)}
                  {order.type === "refund" && <span className="text-xs text-muted-foreground ml-1">(refund)</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
