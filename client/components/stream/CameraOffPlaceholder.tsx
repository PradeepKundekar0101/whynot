"use client";

import Image from "next/image";
import { Mic, MicOff, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface CameraOffPlaceholderProps {
  displayName: string;
  username?: string | null;
  avatarUrl?: string | null;
  /** "seller" gets a self-directed message; "buyer" gets a "be right back" tone. */
  variant: "seller" | "buyer";
  /** When true, draws a subtle "audio is still on" hint. Defaults to true. */
  micOn?: boolean;
  /** Optional secondary message — e.g. "Loading next pack…" */
  subtitle?: string;
}

/**
 * Whatnot-style camera-off placeholder. Filled with an animated tinted
 * background + the seller's avatar centered. Used both in the seller's own
 * preview when they toggle their camera off and in the buyer's player when
 * the seller has paused video mid-stream.
 */
export function CameraOffPlaceholder({
  displayName,
  username,
  avatarUrl,
  variant,
  micOn = true,
  subtitle,
}: CameraOffPlaceholderProps) {
  const heading =
    variant === "seller" ? "Your camera is off" : `${displayName} is off camera`;
  const sub =
    subtitle ??
    (variant === "seller"
      ? "Tap the camera button to turn it back on. Buyers can still hear you."
      : micOn
        ? "Audio is still live — they'll be back any moment."
        : "Hang tight — they'll be back soon.");

  return (
    <div className="relative flex items-center justify-center h-full w-full bg-neutral-900 overflow-hidden">
      {/* Soft animated radial gradient backdrop */}
      <div className="absolute inset-0 placeholder-bg" aria-hidden="true" />

      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-sm">
        {/* Avatar */}
        {avatarUrl ? (
          <div className="relative">
            <Image
              src={avatarUrl}
              alt={displayName}
              width={112}
              height={112}
              className="w-28 h-28 rounded-full object-cover ring-4 ring-white/10 shadow-2xl"
              unoptimized
            />
            <span
              className={cn(
                "absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-neutral-900 ring-2 ring-neutral-900 inline-flex items-center justify-center",
                "text-white"
              )}
              aria-hidden="true"
            >
              <VideoOff className="h-4 w-4" />
            </span>
          </div>
        ) : (
          <div className="relative">
            <div className="w-28 h-28 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center text-4xl font-extrabold ring-4 ring-white/10 shadow-2xl">
              {(displayName || "?").charAt(0).toUpperCase()}
            </div>
            <span className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-neutral-900 ring-2 ring-neutral-900 inline-flex items-center justify-center text-white">
              <VideoOff className="h-4 w-4" />
            </span>
          </div>
        )}

        <h3 className="mt-5 text-white text-lg font-semibold leading-tight">
          {heading}
        </h3>
        {username && (
          <p className="text-white/60 text-xs mt-0.5">@{username}</p>
        )}
        <p className="mt-2 text-sm text-white/70 leading-snug">{sub}</p>

        {/* Mic indicator */}
        <span
          className={cn(
            "mt-4 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full",
            micOn
              ? "bg-green-500/15 text-green-300 border border-green-400/30"
              : "bg-white/5 text-white/60 border border-white/10"
          )}
        >
          {micOn ? (
            <>
              <Mic className="h-3 w-3" /> Audio on
            </>
          ) : (
            <>
              <MicOff className="h-3 w-3" /> Muted
            </>
          )}
        </span>
      </div>

      <style jsx>{`
        :global(.placeholder-bg) {
          background:
            radial-gradient(circle at 30% 20%, rgba(255, 214, 0, 0.18), transparent 55%),
            radial-gradient(circle at 70% 80%, rgba(168, 85, 247, 0.14), transparent 55%),
            linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%);
          animation: placeholder-pulse 8s ease-in-out infinite;
        }
        @keyframes placeholder-pulse {
          0%,
          100% {
            opacity: 0.95;
          }
          50% {
            opacity: 1;
            filter: hue-rotate(8deg);
          }
        }
      `}</style>
    </div>
  );
}
