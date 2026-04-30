"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Radio } from "lucide-react";

export default function SellerDashboard() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  if (isLoading) return null;
  if (!user) {
    router.push("/login");
    return null;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full p-6">
        <h1 className="text-2xl font-bold mb-6">Seller Dashboard</h1>

        {/* Go Live CTA */}
        <div className="rounded-xl border border-border p-6 mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ready to stream?</h2>
            <p className="text-sm text-muted-foreground">Start a live stream and sell to your audience</p>
          </div>
          <Link
            href="/seller/go-live"
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
          >
            <Radio className="h-4 w-4" />
            Go Live
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-muted-foreground">Total Streams</p>
          </div>
          <div className="rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-bold">$0.00</p>
            <p className="text-xs text-muted-foreground">Total Sales</p>
          </div>
          <div className="rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-muted-foreground">Items Sold</p>
          </div>
        </div>

        {/* Recent activity */}
        <div className="rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          <p className="text-sm text-muted-foreground">Your stream history and sales will appear here.</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
