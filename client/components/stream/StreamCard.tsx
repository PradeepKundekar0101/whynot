import Image from "next/image";
import { MockStream } from "@/lib/mock-data";

export function StreamCard({ stream }: { stream: MockStream }) {
  return (
    <div className="flex-shrink-0 w-48 cursor-pointer group">
      <div className="relative w-48 h-64 rounded-xl overflow-hidden bg-muted">
        <Image
          src={stream.thumbnailUrl}
          alt={stream.title}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-200"
          sizes="192px"
        />
        {stream.isLive && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-live text-white text-xs font-semibold px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            Live · {stream.viewerCount.toLocaleString()}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-start gap-2">
        <Image
          src={stream.sellerAvatar}
          alt={stream.sellerUsername}
          width={28}
          height={28}
          className="rounded-full mt-0.5"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{stream.sellerUsername}</p>
          <p className="text-xs text-muted-foreground truncate">{stream.title}</p>
          <span className="text-xs text-muted-foreground">{stream.category}</span>
        </div>
      </div>
    </div>
  );
}
