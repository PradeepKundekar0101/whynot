"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SHOW_CATEGORIES,
  findCategory,
  findSubcategory,
} from "@/lib/show-categories";

interface CategoryPickerProps {
  category: string;
  subcategory: string;
  onChange: (category: string, subcategory: string) => void;
}

export function CategoryPicker({ category, subcategory, onChange }: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<"top" | "sub">("top");
  const [pendingTop, setPendingTop] = useState<string>(category);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const top = findCategory(pendingTop || category);
  const subRecord = findSubcategory(category, subcategory);

  const displayLabel = (() => {
    if (!category) return "Select a category...";
    const cat = findCategory(category);
    if (subRecord) return `${cat?.label} → ${subRecord.label}`;
    return cat?.label ?? "Select a category...";
  })();

  const handleSelectTop = (slug: string) => {
    setPendingTop(slug);
    setLevel("sub");
  };

  const handleSelectSub = (subSlug: string) => {
    onChange(pendingTop, subSlug);
    setOpen(false);
    setLevel("top");
  };

  const handleOpen = () => {
    setOpen((v) => !v);
    setPendingTop(category);
    setLevel(category ? "sub" : "top");
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm text-left flex items-center justify-between hover:border-foreground/30 transition-colors"
      >
        <span className={cn(!category && "text-muted-foreground")}>{displayLabel}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-80 overflow-y-auto bg-white rounded-xl border border-border shadow-lg overflow-hidden">
          {level === "top" && (
            <ul className="py-1">
              {SHOW_CATEGORIES.map((c) => (
                <li key={c.slug}>
                  <button
                    type="button"
                    onClick={() => handleSelectTop(c.slug)}
                    className={cn(
                      "flex items-center justify-between w-full px-4 py-2.5 text-sm text-left hover:bg-secondary transition-colors",
                      category === c.slug && "bg-primary/5 font-semibold"
                    )}
                  >
                    <span>{c.label}</span>
                    <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {level === "sub" && top && (
            <div>
              <button
                type="button"
                onClick={() => setLevel("top")}
                className="flex items-center gap-1 w-full px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-secondary transition-colors border-b border-border"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </button>
              <ul className="py-1">
                {top.children.map((s) => {
                  const isActive = pendingTop === category && subcategory === s.slug;
                  return (
                    <li key={s.slug}>
                      <button
                        type="button"
                        onClick={() => handleSelectSub(s.slug)}
                        className={cn(
                          "flex items-center justify-between w-full px-4 py-2.5 text-sm text-left hover:bg-secondary transition-colors",
                          isActive && "bg-primary/5 font-semibold"
                        )}
                      >
                        <span>{s.label}</span>
                        {isActive && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
