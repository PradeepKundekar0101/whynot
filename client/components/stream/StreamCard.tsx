import Link from "next/link";
import Image from "next/image";

export interface StreamCardData {
  id: string;
  title: string;
  category: string;
  viewerCount: number;
  thumbnailUrl?: string | null;
  isLive?: boolean;
  sellerUsername: string;
  sellerAvatar: string;
  /** ISO datetime — show as upcoming when set and not live */
  scheduledStartAt?: string | null;
  /** ISO datetime — ended / past show */
  endedAt?: string | null;
}

function formatCardDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

export function StreamCard({ stream }: { stream: StreamCardData }) {
  const isLive = stream.isLive !== false && !stream.scheduledStartAt && !stream.endedAt;
  const upcomingTime = stream.scheduledStartAt ? formatCardDateTime(stream.scheduledStartAt) : "";
  const endedTime = stream.endedAt ? formatCardDateTime(stream.endedAt) : "";

  const placeholderLabel = stream.scheduledStartAt
    ? "Upcoming"
    : stream.endedAt
      ? "Past show"
      : "Live";

  return (
    <Link href={`/stream/${stream.id}`} className="flex-shrink-0 w-48 cursor-pointer group">
      <div className="relative w-48 h-64 rounded-xl overflow-hidden bg-muted">
        {stream.thumbnailUrl ? (
          <Image
            src={stream.thumbnailUrl}
            alt={stream.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-200"
            sizes="192px"
          />
        ) : (
          <div className="flex items-center justify-center h-full bg-gradient-to-br from-primary/20 to-primary/5 text-sm text-muted-foreground">
            {placeholderLabel}
          </div>
        )}
        {isLive ? (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-live text-white text-xs font-semibold px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            Live · {stream.viewerCount.toLocaleString()}
          </div>
        ) : stream.scheduledStartAt ? (
          <div className="absolute top-2 left-2 max-w-[calc(100%-1rem)] rounded-full bg-amber-500 text-white text-[11px] font-semibold px-2 py-0.5 leading-tight shadow-sm">
            <span className="block uppercase tracking-wide">Upcoming</span>
            {upcomingTime && <span className="block font-normal opacity-95 truncate">{upcomingTime}</span>}
          </div>
        ) : stream.endedAt ? (
          <div className="absolute top-2 left-2 max-w-[calc(100%-1rem)] rounded-full bg-black/65 text-white text-[11px] font-semibold px-2 py-0.5 leading-tight backdrop-blur-sm">
            <span className="block">Past show</span>
            {endedTime && <span className="block font-normal opacity-90 truncate">{endedTime}</span>}
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex items-start gap-2">
        {stream.sellerAvatar ? (
          <Image
            src={stream.sellerAvatar}
            alt={stream.sellerUsername}
            width={28}
            height={28}
            className="rounded-full mt-0.5"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground mt-0.5">
            {stream.sellerUsername.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{stream.sellerUsername}</p>
          <p className="text-xs text-muted-foreground truncate">{stream.title}</p>
          <span className="text-xs text-muted-foreground">{stream.category}</span>
        </div>
      </div>
    </Link>
  );
}
