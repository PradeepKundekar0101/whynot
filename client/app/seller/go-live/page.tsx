"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import { Navbar } from "@/components/layout/Navbar";

/**
 * Legacy ad-hoc "Go Live" route.
 *
 * Going live is now a transition from a scheduled show:
 *   /seller/schedule  →  /seller/dashboard  →  Go Live  →  /seller/stream/[id]
 *
 * If the user already has a live stream, jump straight back into it; otherwise,
 * send them to /seller/schedule so they can create a show first.
 */
export default function LegacyGoLivePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!user.isSellerEnabled) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/streams/me/active");
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (data.stream) {
            router.replace(`/seller/stream/${data.stream.id}`);
            return;
          }
        }
      } catch {
        // fall through
      }
      router.replace("/seller/schedule");
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isLoading, router]);

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    </div>
  );
}
