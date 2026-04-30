"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const FORMATS = [
  {
    value: "singles" as const,
    label: "Singles",
    description: "Cards sold individually.",
    enabled: false,
  },
  {
    value: "breaks" as const,
    label: "Breaks",
    description:
      "Parts of an unopened pack or box of cards sold to the highest bidder.",
    enabled: true,
  },
  {
    value: "surprise_sets" as const,
    label: "Surprise Sets",
    description:
      "Bundles of products sold without the buyer knowing exactly what they'll receive.",
    enabled: false,
  },
];

interface SellingFormatPickerProps {
  value: "breaks" | "singles" | "surprise_sets";
  onChange: (v: "breaks") => void;
}

export function SellingFormatPicker({ value, onChange }: SellingFormatPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = FORMATS.find((f) => f.value === value) ?? FORMATS[1];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm text-left flex items-center justify-between hover:border-foreground/30 transition-colors"
      >
        <span>{selected.label}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <ul className="absolute z-30 mt-1 w-full bg-white rounded-xl border border-border shadow-lg py-1 overflow-hidden">
          {FORMATS.map((f) => {
            const isSelected = value === f.value;
            return (
              <li key={f.value}>
                <button
                  type="button"
                  disabled={!f.enabled}
                  onClick={() => {
                    if (!f.enabled) return;
                    onChange("breaks");
                    setOpen(false);
                  }}
                  title={!f.enabled ? "Coming soon" : undefined}
                  className={cn(
                    "flex flex-col items-start gap-1 w-full px-4 py-3 text-left transition-colors",
                    f.enabled
                      ? "hover:bg-secondary cursor-pointer"
                      : "opacity-50 cursor-not-allowed"
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {f.label}
                    {!f.enabled && (
                      <span className="text-[10px] uppercase tracking-wide bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full">
                        Coming soon
                      </span>
                    )}
                    {isSelected && f.enabled && <Check className="h-4 w-4 text-primary" />}
                  </span>
                  <span className="text-xs text-muted-foreground leading-snug">
                    {f.description}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
