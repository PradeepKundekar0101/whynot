"use client";

import { sidebarCategories } from "@/lib/mock-data";

export function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-border p-4 overflow-y-auto">
      <p className="text-sm font-semibold mb-4">Hello!</p>
      <nav className="flex flex-col gap-0.5">
        {sidebarCategories.map((category) => (
          <button
            key={category}
            className="text-left px-3 py-2 text-sm rounded-lg hover:bg-secondary transition-colors"
          >
            {category}
          </button>
        ))}
      </nav>
    </aside>
  );
}
