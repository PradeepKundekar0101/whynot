"use client";

import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { apiFetch } from "@/lib/api";

export interface StreamStats {
  totalSalesCents: number;
  uniqueBuyers: number;
  spotsSold: number;
  estimatedPayoutCents: number;
}

const ZERO: StreamStats = {
  totalSalesCents: 0,
  uniqueBuyers: 0,
  spotsSold: 0,
  estimatedPayoutCents: 0,
};

/**
 * Live show-stats subscription. Initial values come from the REST endpoint;
 * subsequent updates arrive via the `stream:stats_updated` WS event broadcast
 * from the server every time a spot is sold.
 */
export function useStreamStats(streamId: string, socket: Socket | null): StreamStats {
  const [stats, setStats] = useState<StreamStats>(ZERO);

  useEffect(() => {
    let cancelled = false;
    void apiFetch(`/streams/${streamId}/stats`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setStats(data);
      });
    return () => {
      cancelled = true;
    };
  }, [streamId]);

  useEffect(() => {
    if (!socket) return;
    const onUpdate = (data: StreamStats) => setStats(data);
    socket.on("stream:stats_updated", onUpdate);
    return () => {
      socket.off("stream:stats_updated", onUpdate);
    };
  }, [socket]);

  return stats;
}
