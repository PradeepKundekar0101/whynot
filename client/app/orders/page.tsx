"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  Gift,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface OrderItem {
  id: string;
  spotId: string;
  spotName: string;
  description: string | null;
  priceCents: number;
}

interface Order {
  id: string;
  status: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  shippingProfile: string | null;
  trackingNumber: string | null;
  createdAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  items: OrderItem[];
  listing: { breakName: string; breakFormat: string };
  seller: { username: string; displayName: string; avatarUrl: string | null };
  stream: { id: string; title: string };
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
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

const STATUS_BADGE: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  pending_shipment: {
    label: "Pending shipment",
    icon: Package,
    className: "bg-amber-100 text-amber-700",
  },
  shipped: {
    label: "Shipped",
    icon: Truck,
    className: "bg-blue-100 text-blue-700",
  },
  delivered: {
    label: "Delivered",
    icon: CheckCircle2,
    className: "bg-green-100 text-green-700",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "bg-green-100 text-green-700",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    className: "bg-red-100 text-red-700",
  },
};

export default function OrdersPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch("/orders");
        if (!cancelled && res.ok) {
          const data = await res.json();
          setOrders(data.orders ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (isLoading || !user) return null;

  return (
    <div className="flex flex-col min-h-screen bg-[#FAFAFA]">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto w-full p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">My Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Items you&rsquo;ve won and bought from live shows.
          </p>
        </header>

        {loading ? (
          <p className="text-sm text-muted-foreground py-12 text-center">Loading orders…</p>
        ) : orders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-white p-10 text-center">
            <Gift className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="font-semibold">No orders yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your wins from breaks and Buy It Now spots will show up here.
            </p>
            <Link
              href="/browse"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Browse live shows
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {orders.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  const badge = STATUS_BADGE[order.status] ?? {
    label: order.status,
    icon: Clock,
    className: "bg-secondary text-muted-foreground",
  };
  const Icon = badge.icon;

  return (
    <article className="rounded-2xl border border-border bg-white overflow-hidden">
      <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="min-w-0">
          <p className="text-base font-bold truncate">{order.listing.breakName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            from{" "}
            <Link
              href={`/profile/${order.seller.username}`}
              className="font-medium hover:underline"
            >
              @{order.seller.username}
            </Link>
            <span className="mx-1.5 text-muted-foreground/50">·</span>
            {formatDateTime(order.createdAt)}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0",
            badge.className
          )}
        >
          <Icon className="h-3 w-3" />
          {badge.label}
        </span>
      </header>

      <div className="px-5 py-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          {order.items.length} {order.items.length === 1 ? "item" : "items"}
        </p>
        <ul className="space-y-2 mb-4">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{item.spotName}</p>
                {item.description && item.description !== item.spotName && (
                  <p className="text-xs text-primary font-semibold flex items-center gap-1 mt-0.5">
                    <Sparkles className="h-3 w-3" />
                    {item.description}
                  </p>
                )}
              </div>
              <p className="text-sm tabular-nums font-medium shrink-0">
                {formatCents(item.priceCents)}
              </p>
            </li>
          ))}
        </ul>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm border-t border-border pt-3">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="text-right tabular-nums">{formatCents(order.subtotalCents)}</dd>
          <dt className="text-muted-foreground">Shipping</dt>
          <dd className="text-right tabular-nums">{formatCents(order.shippingCents)}</dd>
          <dt className="text-muted-foreground">Tax</dt>
          <dd className="text-right tabular-nums">{formatCents(order.taxCents)}</dd>
          <dt className="font-semibold mt-1 border-t border-border pt-1">Total</dt>
          <dd className="text-right font-bold tabular-nums mt-1 border-t border-border pt-1">
            {formatCents(order.totalCents)}
          </dd>
        </dl>

        {order.trackingNumber && (
          <p className="mt-3 text-xs text-muted-foreground">
            Tracking: <span className="font-mono">{order.trackingNumber}</span>
          </p>
        )}
      </div>
    </article>
  );
}
