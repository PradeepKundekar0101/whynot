import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { emitToStream } from "../websocket/emitter";
import logger from "../lib/logger";

/** Discriminated union of every system event payload we emit into chat. */
export type SystemEventData =
  | { eventType: "user_joined"; userId: string; username: string }
  | { eventType: "user_followed"; followerId: string; followerUsername: string }
  | {
      eventType: "auction_started";
      spotId: string;
      spotNumber: number;
      spotName: string;
      startingBid: number;
    }
  | {
      eventType: "new_bid";
      spotId: string;
      spotNumber: number;
      bidderId: string;
      bidderUsername: string;
      amount: number;
    }
  | {
      eventType: "timer_extended";
      spotId: string;
      spotNumber: number;
    }
  | {
      eventType: "spot_won";
      spotId: string;
      spotNumber: number;
      winnerId: string;
      winnerUsername: string;
      soldPrice: number;
    }
  | {
      eventType: "spot_purchased";
      spotId: string;
      spotNumber: number;
      buyerId: string;
      buyerUsername: string;
      soldPrice: number;
    }
  | {
      eventType: "spot_revealed";
      spotId: string;
      spotNumber: number;
      winnerId: string | null;
      winnerUsername: string | null;
      revealText: string;
    }
  | { eventType: "break_started"; listingId: string; breakName: string }
  | {
      eventType: "break_completed";
      listingId: string;
      breakName: string;
      winnerCount: number;
    };

/**
 * Throttle bucket keyed by stream + event-type. Used to batch bursty events
 * (e.g. 50 viewers joining within 1 second) into one summarized chat row.
 */
const throttleBuckets = new Map<
  string,
  { count: number; latest: Record<string, unknown>; flushAt: number; timer: NodeJS.Timeout }
>();

const THROTTLE_WINDOW_MS = 1500;
const THROTTLED_EVENT_TYPES: SystemEventData["eventType"][] = ["user_joined"];

function throttleKey(streamId: string, eventType: string) {
  return `${streamId}:${eventType}`;
}

/**
 * Persist + broadcast a system event into the stream's chat feed.
 * Throttles certain event types: if more events of the same type arrive within
 * 1.5s on the same stream, they collapse into a single "N viewers joined" row.
 */
export async function emitSystemEvent(streamId: string, data: SystemEventData) {
  if (THROTTLED_EVENT_TYPES.includes(data.eventType)) {
    queueThrottled(streamId, data);
    return;
  }
  await persistAndEmit(streamId, data);
}

function queueThrottled(streamId: string, data: SystemEventData) {
  const key = throttleKey(streamId, data.eventType);
  const existing = throttleBuckets.get(key);
  if (existing) {
    existing.count += 1;
    existing.latest = data;
    return;
  }
  const flushAt = Date.now() + THROTTLE_WINDOW_MS;
  const timer = setTimeout(async () => {
    const bucket = throttleBuckets.get(key);
    throttleBuckets.delete(key);
    if (!bucket) return;
    if (bucket.count <= 1) {
      await persistAndEmit(streamId, bucket.latest as SystemEventData);
      return;
    }
    // Collapsed event with `batchCount` field.
    const collapsed: SystemEventData = {
      ...(bucket.latest as SystemEventData),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      batchCount: bucket.count,
    } as SystemEventData & { batchCount: number };
    await persistAndEmit(streamId, collapsed);
  }, THROTTLE_WINDOW_MS);
  throttleBuckets.set(key, { count: 1, latest: data, flushAt, timer });
}

async function persistAndEmit(streamId: string, data: SystemEventData) {
  try {
    const message = await prisma.chatMessage.create({
      data: {
        streamId,
        type: "system",
        eventType: data.eventType,
        eventData: data as unknown as Prisma.InputJsonValue,
      },
    });
    emitToStream(streamId, "chat:message", {
      id: message.id,
      type: "system",
      eventType: data.eventType,
      eventData: data,
      createdAt: message.createdAt,
    });
  } catch (err) {
    logger.error(err, `Failed to persist system event ${data.eventType}`);
  }
}
