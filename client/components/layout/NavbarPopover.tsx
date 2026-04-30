"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface NavbarPopoverProps {
  /** The trigger button (typically a Lucide icon). */
  icon: ReactNode;
  /** Accessible name + tooltip. */
  label: string;
  /** Title shown at the top of the popover panel. */
  title: string;
  /** Body of the popover — typically a short empty-state message. */
  children: ReactNode;
  /** Optional dot/count badge in the corner of the trigger. */
  badge?: number;
}

/**
 * Generic icon-button that opens a small popover anchored to the navbar.
 * Used for the Likes, Messages, Notifications, Gifts buttons — they don't have
 * real backends yet, so they each show a simple "no items yet" empty state.
 *
 * Closes on Escape, outside click, or scroll.
 */
export function NavbarPopover({ icon, label, title, children, badge }: NavbarPopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        title={label}
        className={cn(
          "p-2 rounded-full hover:bg-secondary transition-colors relative",
          open && "bg-secondary"
        )}
      >
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-destructive text-white text-[10px] font-bold">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-72 bg-white border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">{title}</p>
          </div>
          <div className="px-4 py-6 text-center">{children}</div>
        </div>
      )}
    </div>
  );
}
