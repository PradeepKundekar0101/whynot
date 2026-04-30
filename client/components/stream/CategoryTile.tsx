import Link from "next/link";

interface CategoryTileProps {
  label: string;
  /** Number of streams currently live in this category. Hidden when 0. */
  liveCount?: number;
}

export function CategoryTile({ label, liveCount = 0 }: CategoryTileProps) {
  const href = `/browse?category=${encodeURIComponent(label)}`;
  return (
    <Link
      href={href}
      className="flex-shrink-0 flex flex-col items-center justify-center w-40 h-24 rounded-xl bg-primary/15 hover:bg-primary/25 transition-colors text-center px-3"
    >
      <span className="text-sm font-semibold text-foreground line-clamp-2 leading-tight">
        {label}
      </span>
      {liveCount > 0 ? (
        <span className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
          {liveCount} live
        </span>
      ) : (
        <span className="text-xs text-muted-foreground mt-1">Browse</span>
      )}
    </Link>
  );
}
