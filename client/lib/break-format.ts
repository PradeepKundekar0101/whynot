import type { Spot } from "./break-types";

export function formatCents(cents: number | null | undefined): string {
  const c = cents ?? 0;
  return `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCentsCompact(cents: number | null | undefined): string {
  const c = cents ?? 0;
  // For bids we typically show whole dollars when possible.
  if (c % 100 === 0) return `$${c / 100}`;
  return formatCents(c);
}

export function formatTimer(secondsRemaining: number): string {
  const s = Math.max(0, Math.floor(secondsRemaining));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function nextMinBidCents(spot: Spot): number {
  if (spot.currentBid && spot.currentBid > 0) {
    return spot.currentBid + 100; // +$1
  }
  return spot.startingBid ?? spot.startingPrice ?? 100;
}

export function shippingProfileLabel(value: string): string {
  const map: Record<string, string> = {
    "0-1oz": "0–1 oz",
    "1-3oz": "1–3 oz",
    "4-7oz": "4–7 oz",
    "8-15oz": "8–15 oz",
    "1-2lb": "1–2 lb",
    "2-5lb": "2–5 lb",
    "5-10lb": "5–10 lb",
  };
  return map[value] ?? value;
}
