"use client";

import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { StreamCard, StreamCardData } from "@/components/stream/StreamCard";
import { CategoryTile } from "@/components/stream/CategoryTile";
import { apiFetch } from "@/lib/api";
import { findCategory, SHOW_CATEGORIES } from "@/lib/show-categories";
import Link from "next/link";
import { Radio } from "lucide-react";

interface ApiStream {
  id: string;
  title: string;
  category: string;
  primaryCategory: string | null;
  viewerCount: number;
  thumbnailUrl: string | null;
  scheduledStartAt?: string | null;
  endedAt?: string | null;
  seller: { username: string; avatarUrl: string | null } | null;
}

/**
 * Get a human label for whatever the stream's category column happens to hold.
 * Old rows store the label ("Electronics") while new schedule-a-show rows store
 * the slug ("electronics"). Try both.
 */
function categoryLabelFor(stream: ApiStream): string {
  const slug = stream.primaryCategory ?? stream.category;
  if (!slug) return "Uncategorized";
  return findCategory(slug)?.label ?? slug;
}

export default function Home() {
  const [liveStreams, setLiveStreams] = useState<StreamCardData[]>([]);
  const [upcomingStreams, setUpcomingStreams] = useState<StreamCardData[]>([]);
  const [pastStreams, setPastStreams] = useState<StreamCardData[]>([]);
  const [rawStreams, setRawStreams] = useState<ApiStream[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [liveRes, discoverRes] = await Promise.all([
          apiFetch("/streams/live"),
          apiFetch("/streams/discover/home"),
        ]);
        if (!cancelled && liveRes.ok) {
          const data = await liveRes.json();
          const streams: ApiStream[] = data.streams ?? [];
          setRawStreams(streams);
          setLiveStreams(
            streams.map((s) => ({
              id: s.id,
              title: s.title,
              category: categoryLabelFor(s),
              viewerCount: s.viewerCount,
              thumbnailUrl: s.thumbnailUrl,
              isLive: true,
              sellerUsername: s.seller?.username || "unknown",
              sellerAvatar: s.seller?.avatarUrl || "",
            }))
          );
        }
        if (!cancelled && discoverRes.ok) {
          const d = await discoverRes.json();
          const upcoming: ApiStream[] = d.upcoming ?? [];
          const past: ApiStream[] = d.past ?? [];
          setUpcomingStreams(
            upcoming.map((s) => ({
              id: s.id,
              title: s.title,
              category: categoryLabelFor(s),
              viewerCount: s.viewerCount ?? 0,
              thumbnailUrl: s.thumbnailUrl,
              isLive: false,
              sellerUsername: s.seller?.username || "unknown",
              sellerAvatar: s.seller?.avatarUrl || "",
              scheduledStartAt: s.scheduledStartAt ?? null,
            }))
          );
          setPastStreams(
            past.map((s) => ({
              id: s.id,
              title: s.title,
              category: categoryLabelFor(s),
              viewerCount: s.viewerCount ?? 0,
              thumbnailUrl: s.thumbnailUrl,
              isLive: false,
              sellerUsername: s.seller?.username || "unknown",
              sellerAvatar: s.seller?.avatarUrl || "",
              endedAt: s.endedAt ?? null,
            }))
          );
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // For each top category, count how many live streams it currently has.
  // Match by either slug or label so legacy rows surface in the right tile.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cat of SHOW_CATEGORIES) {
      const n = rawStreams.filter((s) => {
        const sCat = s.primaryCategory ?? s.category;
        return sCat === cat.slug || sCat === cat.label;
      }).length;
      counts.set(cat.slug, n);
    }
    return counts;
  }, [rawStreams]);

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-4">Live now</h2>
            {!loaded ? (
              <p className="text-sm text-muted-foreground">Loading live shows…</p>
            ) : liveStreams.length === 0 ? (
              <EmptyLive />
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {liveStreams.map((stream) => (
                  <StreamCard key={stream.id} stream={stream} />
                ))}
              </div>
            )}
          </section>

          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-4">Upcoming shows</h2>
            {!loaded ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : upcomingStreams.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-2xl border border-dashed border-border bg-white px-6 py-8 text-center">
                No upcoming shows scheduled. Check back soon or browse live categories below.
              </p>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {upcomingStreams.map((stream) => (
                  <StreamCard key={stream.id} stream={stream} />
                ))}
              </div>
            )}
          </section>

          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-4">Past shows</h2>
            {!loaded ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : pastStreams.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-2xl border border-dashed border-border bg-white px-6 py-8 text-center">
                No past shows to show yet. Ended streams will appear here.
              </p>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {pastStreams.map((stream) => (
                  <StreamCard key={`past-${stream.id}`} stream={stream} />
                ))}
              </div>
            )}
          </section>

          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-4">Browse categories</h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {SHOW_CATEGORIES.map((cat) => (
                <CategoryTile
                  key={cat.slug}
                  label={cat.label}
                  liveCount={categoryCounts.get(cat.slug) ?? 0}
                />
              ))}
            </div>
          </section>
        </main>
      </div>
      <Footer />
    </div>
  );
}

function EmptyLive() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white p-10 text-center">
      <div className="inline-flex w-12 h-12 rounded-full bg-secondary items-center justify-center mb-3">
        <Radio className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-semibold mb-1">No live shows right now</p>
      <p className="text-sm text-muted-foreground mb-4">
        Check back soon — or schedule one of your own.
      </p>
      <Link
        href="/browse"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
      >
        Browse all shows
      </Link>
    </div>
  );
}
