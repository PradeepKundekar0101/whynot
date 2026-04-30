import { MockCategory } from "@/lib/mock-data";

export function CategoryTile({ category }: { category: MockCategory }) {
  return (
    <button className="flex-shrink-0 flex flex-col items-center justify-center w-40 h-24 rounded-xl bg-primary/20 hover:bg-primary/30 transition-colors">
      <span className="text-sm font-semibold text-foreground">{category.name}</span>
      <span className="text-xs text-muted-foreground mt-1">
        {category.viewerCount.toLocaleString()} watching
      </span>
    </button>
  );
}
