"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import { Navbar } from "@/components/layout/Navbar";
import { BroadcasterView } from "@/components/seller/BroadcasterView";

interface ResumePayload {
  stream: { id: string; title: string; category: string };
  token: string;
}

/**
 * Owns the broadcaster experience for a specific stream id.
 * On mount we mint a fresh publisher token via the server, so a hard refresh of this URL
 * resumes the stream rather than dropping back to the create form.
 */
export default function SellerStreamPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const streamId = params.id as string;

  const [data, setData] = useState<ResumePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/streams/${streamId}/broadcaster-token`, {
          method: "POST",
        });
        if (cancelled) return;
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const code = err?.error?.code;
          if (code === "STREAM_NOT_LIVE" || code === "NOT_FOUND") {
            // Stream isn't live (or doesn't exist) — bounce to the create form.
            router.replace("/seller/go-live");
            return;
          }
          if (code === "NOT_AUTHORIZED") {
            setLoadError("You don't own this stream.");
            return;
          }
          setLoadError(err?.error?.message || "Could not resume stream.");
          return;
        }
        const payload = (await res.json()) as ResumePayload;
        setData(payload);
      } catch {
        if (!cancelled) setLoadError("Could not resume stream.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [streamId, user, isLoading, router]);

  if (isLoading || (!data && !loadError)) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Resuming your stream...</p>
        </main>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-semibold mb-2">{loadError || "Stream unavailable"}</p>
            <button
              onClick={() => router.push("/seller/go-live")}
              className="text-sm text-primary hover:underline"
            >
              Start a new stream
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <BroadcasterView
      streamId={data.stream.id}
      token={data.token}
      title={data.stream.title}
    />
  );
}
