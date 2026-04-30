"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SECTIONS } from "../types";

export function SectionNav() {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveId(visible.target.id);
      },
      { rootMargin: "-25% 0px -65% 0px", threshold: [0, 0.25, 0.5, 1] }
    );

    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - 80,
        behavior: "smooth",
      });
      setActiveId(id);
    }
  };

  return (
    <nav className="sticky top-20 self-start flex flex-col gap-1 text-sm">
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          onClick={(e) => handleClick(e, s.id)}
          className={cn(
            "px-3 py-2 rounded-lg transition-colors border-l-2",
            activeId === s.id
              ? "border-primary bg-primary/5 text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
