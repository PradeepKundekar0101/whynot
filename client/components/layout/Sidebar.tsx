"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SHOW_CATEGORIES } from "@/lib/show-categories";
import { cn } from "@/lib/utils";

function SidebarNavFallback() {
  return (
    <nav className="flex flex-col gap-0.5" aria-hidden>
      <div className="h-9 rounded-lg bg-muted animate-pulse" />
      {SHOW_CATEGORIES.map((cat) => (
        <div key={cat.slug} className="h-9 rounded-lg bg-muted animate-pulse" />
      ))}
    </nav>
  );
}

function SidebarNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const activeCategory = params.get("category") ?? "";

  return (
    <nav className="flex flex-col gap-0.5">
      <Link
        href="/"
        className={cn(
          "inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
          pathname === "/" && !activeCategory
            ? "bg-secondary font-semibold"
            : "hover:bg-secondary text-muted-foreground"
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
        For You
      </Link>
      {SHOW_CATEGORIES.map((cat) => {
        const href = `/browse?category=${encodeURIComponent(cat.label)}`;
        const isActive =
          pathname.startsWith("/browse") && activeCategory === cat.label;
        return (
          <Link
            key={cat.slug}
            href={href}
            className={cn(
              "px-3 py-2 text-sm rounded-lg transition-colors",
              isActive
                ? "bg-secondary font-semibold"
                : "hover:bg-secondary text-muted-foreground"
            )}
          >
            {cat.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const { user } = useAuth();

  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-border p-4 overflow-y-auto">
      {user && (
        <p className="text-sm font-semibold mb-4 truncate" title={user.username}>
          Hello {user.username}!
        </p>
      )}
      <Suspense fallback={<SidebarNavFallback />}>
        <SidebarNav />
      </Suspense>
    </aside>
  );
}
