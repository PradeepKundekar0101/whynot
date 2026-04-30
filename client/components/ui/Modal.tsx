"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  /** Render a dark-themed modal (for the seller control room). Defaults to light. */
  variant?: "light" | "dark";
}

const SIZE_CLASS = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-6xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  variant = "light",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const isDark = variant === "dark";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-2xl shadow-2xl flex flex-col max-h-[90vh]",
          SIZE_CLASS[size],
          isDark
            ? "bg-neutral-900 text-white border border-white/10"
            : "bg-white text-foreground border border-border"
        )}
      >
        {(title || description) && (
          <div
            className={cn(
              "flex items-start justify-between gap-4 px-6 py-4 border-b shrink-0",
              isDark ? "border-white/10" : "border-border"
            )}
          >
            <div className="min-w-0">
              {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
              {description && (
                <p
                  className={cn(
                    "mt-1 text-sm",
                    isDark ? "text-white/60" : "text-muted-foreground"
                  )}
                >
                  {description}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className={cn(
                "p-1.5 rounded-full transition-colors shrink-0",
                isDark ? "hover:bg-white/10" : "hover:bg-secondary"
              )}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div
            className={cn(
              "px-6 py-4 border-t flex items-center justify-end gap-2 shrink-0",
              isDark ? "border-white/10 bg-neutral-900" : "border-border bg-secondary/30"
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
