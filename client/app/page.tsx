import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { StreamCard } from "@/components/stream/StreamCard";
import { CategoryTile } from "@/components/stream/CategoryTile";
import { mockStreams, mockCategories } from "@/lib/mock-data";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Live Now</h2>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {mockStreams.map((stream) => (
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
            const streams = mockStreams.filter((s) => s.category === categoryName);
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
