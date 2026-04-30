"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { StreamCard, StreamCardData } from "@/components/stream/StreamCard";
import { CategoryTile } from "@/components/stream/CategoryTile";
import { mockStreams, mockCategories } from "@/lib/mock-data";
import { apiFetch } from "@/lib/api";

export default function Home() {
  const [liveStreams, setLiveStreams] = useState<StreamCardData[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch("/streams/live");
        if (res.ok) {
          const data = await res.json();
          if (data.streams && data.streams.length > 0) {
            setLiveStreams(
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
          }
        }
      } catch {
        // Use mock data fallback
      } finally {
        setLoaded(true);
      }
    };
    load();
  }, []);

  // Use real streams if available, otherwise mock
  const streamsToShow: StreamCardData[] =
    liveStreams.length > 0
      ? liveStreams
      : mockStreams.map((s) => ({
          id: s.id,
          title: s.title,
          category: s.category,
          viewerCount: s.viewerCount,
          thumbnailUrl: s.thumbnailUrl,
          isLive: s.isLive,
          sellerUsername: s.sellerUsername,
          sellerAvatar: s.sellerAvatar,
        }));

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">
              {liveStreams.length > 0 ? "Live Now" : "Featured Streams"}
            </h2>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {streamsToShow.map((stream) => (
                <StreamCard key={stream.id} stream={stream} />
              ))}
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Categories You Might Like</h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {mockCategories.map((category) => (
                <CategoryTile key={category.slug} category={category} />
              ))}
            </div>
          </section>

          {["Electronics", "Pokemon Cards", "Sports Cards"].map((categoryName) => {
            const streams = streamsToShow.filter((s) => s.category === categoryName);
            if (streams.length === 0) return null;
            return (
              <section key={categoryName} className="mb-8">
                <h2 className="text-lg font-semibold mb-4">Recommended in {categoryName}</h2>
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {streams.map((stream) => (
                    <StreamCard key={stream.id} stream={stream} />
                  ))}
                </div>
              </section>
            );
          })}
        </main>
      </div>
      <Footer />
    </div>
  );
}
