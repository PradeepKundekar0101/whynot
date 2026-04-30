"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { StreamCard, StreamCardData } from "@/components/stream/StreamCard";
import { apiFetch } from "@/lib/api";
import { findCategory, SHOW_CATEGORIES } from "@/lib/show-categories";

const ALL_CATEGORIES = ["All", ...SHOW_CATEGORIES.map((c) => c.label)];

interface ApiStream {
  id: string;
  title: string;
  category: string;
  primaryCategory: string | null;
  viewerCount: number;
  thumbnailUrl: string | null;
  seller: { username: string; avatarUrl: string | null } | null;
}

function categoryLabelFor(stream: ApiStream): string {
  const slug = stream.primaryCategory ?? stream.category;
  if (!slug) return "Uncategorized";
  return findCategory(slug)?.label ?? slug;
}

export function BrowseContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeCategory = searchParams.get("category") || "All";
  const [streams, setStreams] = useState<StreamCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // Server filters by stored category string. We pass either the slug
        // (new schedule-a-show rows) or the human label (legacy rows). The
        // browse-all path skips the filter entirely and we filter client-side.
        const res = await apiFetch("/streams/live");
        if (!cancelled && res.ok) {
          const data = await res.json();
          const all: ApiStream[] = data.streams ?? [];
          const filtered =
            activeCategory === "All"
              ? all
              : all.filter((s) => categoryLabelFor(s) === activeCategory);
          setStreams(
            filtered.map((s) => ({
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
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeCategory]);

  const handleCategoryClick = (cat: string) => {
    if (cat === "All") {
      router.push("/browse");
    } else {
      router.push(`/browse?category=${encodeURIComponent(cat)}`);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <h1 className="text-2xl font-bold mb-6">Browse Live Streams</h1>

        {/* Category filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-6">
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryClick(cat)}
              className={`px-4 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${
                activeCategory === cat
                  ? "bg-black text-white"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Stream grid */}
        {loading ? (
          <p className="text-muted-foreground">Loading streams...</p>
        ) : streams.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-white p-10 text-center">
            <div className="inline-flex w-12 h-12 rounded-full bg-secondary items-center justify-center mb-3">
              <Radio className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-semibold mb-1">No live shows</p>
            <p className="text-sm text-muted-foreground">
              {activeCategory !== "All"
                ? `No one is streaming in ${activeCategory} right now.`
                : "No one is streaming right now. Check back soon!"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {streams.map((stream) => (
              <StreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
