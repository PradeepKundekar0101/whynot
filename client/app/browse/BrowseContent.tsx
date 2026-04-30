"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { StreamCard, StreamCardData } from "@/components/stream/StreamCard";
import { mockCategories, mockStreams } from "@/lib/mock-data";
import { apiFetch } from "@/lib/api";

const ALL_CATEGORIES = ["All", ...mockCategories.map((c) => c.name)];

export function BrowseContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeCategory = searchParams.get("category") || "All";
  const [streams, setStreams] = useState<StreamCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const url =
          activeCategory === "All"
            ? "/streams/live"
            : `/streams/live?category=${encodeURIComponent(activeCategory)}`;
        const res = await apiFetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.streams && data.streams.length > 0) {
            setStreams(
              data.streams.map((s: any) => ({
                id: s.id,
                title: s.title,
                category: s.category,
                viewerCount: s.viewerCount,
                thumbnailUrl: s.thumbnailUrl,
                isLive: true,
                sellerUsername: s.seller?.username || "unknown",
                sellerAvatar: s.seller?.avatarUrl || "",
              }))
            );
            return;
          }
        }
      } catch {}

      // Fallback to mock data
      const filtered =
        activeCategory === "All"
          ? mockStreams
          : mockStreams.filter((s) => s.category === activeCategory);
      setStreams(
        filtered.map((s) => ({
          id: s.id,
          title: s.title,
          category: s.category,
          viewerCount: s.viewerCount,
          thumbnailUrl: s.thumbnailUrl,
          isLive: s.isLive,
          sellerUsername: s.sellerUsername,
          sellerAvatar: s.sellerAvatar,
        }))
      );
    };
    load().finally(() => setLoading(false));
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
          <div className="text-center py-12">
            <p className="text-lg font-semibold mb-2">No live streams</p>
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
