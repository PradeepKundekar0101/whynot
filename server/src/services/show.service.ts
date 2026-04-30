import { v4 as uuidv4 } from "uuid";
import prisma from "../lib/prisma";
import redis from "../lib/redis";
import { roomService, createPublisherToken } from "../lib/livekit";
import logger from "../lib/logger";

const LIVE_STREAMS_CACHE_KEY = "streams:live";

export interface ScheduleShowInput {
  title: string;
  description?: string;
  scheduledStartAt: Date;
  scheduledEndAt?: Date;
  primaryCategory: string;
  primarySubcategory?: string;
  primarySellingFormat: "breaks";
  tags: string[];
  thumbnailUrl: string;
  videoPreviewUrl?: string;
  moderatorIds?: string[];
  freePickupEnabled?: boolean;
  pickupAddressId?: string;
  pickupInstructions?: string;
  domesticShippingFee?: number;
  combinedShippingEnabled?: boolean;
  isAdultContent?: boolean;
  allowChatReplays?: boolean;
  recordingEnabled?: boolean;
  notifyFollowers?: boolean;
  boostEnabled?: boolean;
  repeatRule?: string;
}

export type ShowUpdateInput = Partial<ScheduleShowInput>;

/**
 * Reject if the seller already has a scheduled or live show that overlaps
 * the requested window. We treat the new show as a 2-hour block when no
 * scheduledEndAt is provided so the conflict check has something to compare against.
 */
async function assertNoConflict(
  sellerId: string,
  startAt: Date,
  endAt: Date | undefined,
  ignoreShowId?: string
) {
  const windowStart = startAt;
  const windowEnd = endAt ?? new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  const conflict = await prisma.stream.findFirst({
    where: {
      sellerId,
      status: { in: ["scheduled", "live"] },
      ...(ignoreShowId ? { NOT: { id: ignoreShowId } } : {}),
      OR: [
        {
          scheduledStartAt: { lte: windowEnd },
          scheduledEndAt: { gte: windowStart },
        },
        {
          scheduledStartAt: { gte: windowStart, lte: windowEnd },
        },
      ],
    },
  });

  if (conflict) {
    const err = new Error("SHOW_CONFLICT") as Error & {
      conflict: { id: string; title: string; scheduledStartAt: Date | null };
    };
    err.conflict = {
      id: conflict.id,
      title: conflict.title,
      scheduledStartAt: conflict.scheduledStartAt,
    };
    throw err;
  }
}

export async function scheduleShow(sellerId: string, input: ScheduleShowInput) {
  await assertNoConflict(sellerId, input.scheduledStartAt, input.scheduledEndAt);

  const livekitRoomName = `show_${uuidv4()}`;

  const stream = await prisma.stream.create({
    data: {
      sellerId,
      title: input.title,
      description: input.description,
      thumbnailUrl: input.thumbnailUrl,
      videoPreviewUrl: input.videoPreviewUrl,
      // Legacy field kept in sync with the new categorization
      category: input.primaryCategory,
      primaryCategory: input.primaryCategory,
      primarySubcategory: input.primarySubcategory,
      primarySellingFormat: input.primarySellingFormat,
      tags: input.tags,
      status: "scheduled",
      scheduledStartAt: input.scheduledStartAt,
      scheduledEndAt: input.scheduledEndAt,
      repeatRule: input.repeatRule,
      livekitRoomName,
      moderatorIds: input.moderatorIds ?? [],
      freePickupEnabled: input.freePickupEnabled ?? false,
      pickupAddressId: input.pickupAddressId,
      pickupInstructions: input.pickupInstructions,
      domesticShippingFee: input.domesticShippingFee,
      combinedShippingEnabled: input.combinedShippingEnabled ?? true,
      isAdultContent: input.isAdultContent ?? false,
      allowChatReplays: input.allowChatReplays ?? true,
      recordingEnabled: input.recordingEnabled ?? false,
      notifyFollowers: input.notifyFollowers ?? true,
      boostEnabled: input.boostEnabled ?? false,
    },
    include: {
      seller: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });

  return stream;
}

export async function updateScheduledShow(
  showId: string,
  sellerId: string,
  input: ShowUpdateInput
) {
  const existing = await prisma.stream.findUnique({ where: { id: showId } });
  if (!existing) throw new Error("SHOW_NOT_FOUND");
  if (existing.sellerId !== sellerId) throw new Error("NOT_AUTHORIZED");
  if (existing.status !== "scheduled") throw new Error("SHOW_NOT_EDITABLE");

  if (input.scheduledStartAt) {
    await assertNoConflict(
      sellerId,
      input.scheduledStartAt,
      input.scheduledEndAt ?? existing.scheduledEndAt ?? undefined,
      showId
    );
  }

  return prisma.stream.update({
    where: { id: showId },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.thumbnailUrl !== undefined && { thumbnailUrl: input.thumbnailUrl }),
      ...(input.videoPreviewUrl !== undefined && { videoPreviewUrl: input.videoPreviewUrl }),
      ...(input.primaryCategory !== undefined && {
        primaryCategory: input.primaryCategory,
        category: input.primaryCategory,
      }),
      ...(input.primarySubcategory !== undefined && { primarySubcategory: input.primarySubcategory }),
      ...(input.primarySellingFormat !== undefined && { primarySellingFormat: input.primarySellingFormat }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.scheduledStartAt !== undefined && { scheduledStartAt: input.scheduledStartAt }),
      ...(input.scheduledEndAt !== undefined && { scheduledEndAt: input.scheduledEndAt }),
      ...(input.repeatRule !== undefined && { repeatRule: input.repeatRule }),
      ...(input.moderatorIds !== undefined && { moderatorIds: input.moderatorIds }),
      ...(input.freePickupEnabled !== undefined && { freePickupEnabled: input.freePickupEnabled }),
      ...(input.pickupAddressId !== undefined && { pickupAddressId: input.pickupAddressId }),
      ...(input.pickupInstructions !== undefined && { pickupInstructions: input.pickupInstructions }),
      ...(input.domesticShippingFee !== undefined && { domesticShippingFee: input.domesticShippingFee }),
      ...(input.combinedShippingEnabled !== undefined && {
        combinedShippingEnabled: input.combinedShippingEnabled,
      }),
      ...(input.isAdultContent !== undefined && { isAdultContent: input.isAdultContent }),
      ...(input.allowChatReplays !== undefined && { allowChatReplays: input.allowChatReplays }),
      ...(input.recordingEnabled !== undefined && { recordingEnabled: input.recordingEnabled }),
      ...(input.notifyFollowers !== undefined && { notifyFollowers: input.notifyFollowers }),
      ...(input.boostEnabled !== undefined && { boostEnabled: input.boostEnabled }),
    },
  });
}

export async function cancelScheduledShow(showId: string, sellerId: string) {
  const existing = await prisma.stream.findUnique({ where: { id: showId } });
  if (!existing) throw new Error("SHOW_NOT_FOUND");
  if (existing.sellerId !== sellerId) throw new Error("NOT_AUTHORIZED");
  if (existing.status !== "scheduled") throw new Error("SHOW_NOT_CANCELLABLE");

  return prisma.stream.update({
    where: { id: showId },
    data: { status: "cancelled" },
  });
}

export async function getUpcomingShows(sellerId: string) {
  return prisma.stream.findMany({
    where: {
      sellerId,
      status: { in: ["scheduled", "live"] },
    },
    orderBy: [{ status: "asc" }, { scheduledStartAt: "asc" }],
    include: {
      seller: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });
}

export async function getPastShows(sellerId: string, limit = 20) {
  return prisma.stream.findMany({
    where: {
      sellerId,
      status: { in: ["ended", "cancelled"] },
    },
    orderBy: { endedAt: "desc" },
    take: limit,
  });
}

const DISCOVER_FEED_LIMIT = 18;

/** Platform-wide scheduled shows with a future start time (homepage discovery). */
export async function getDiscoverUpcoming(limit = DISCOVER_FEED_LIMIT) {
  return prisma.stream.findMany({
    where: {
      status: "scheduled",
      scheduledStartAt: { gte: new Date() },
    },
    orderBy: { scheduledStartAt: "asc" },
    take: limit,
    include: {
      seller: { select: { username: true, avatarUrl: true } },
    },
  });
}

/** Recently ended streams from all sellers (homepage discovery). */
export async function getDiscoverPast(limit = DISCOVER_FEED_LIMIT) {
  return prisma.stream.findMany({
    where: { status: "ended" },
    orderBy: { endedAt: "desc" },
    take: limit,
    include: {
      seller: { select: { username: true, avatarUrl: true } },
    },
  });
}

/**
 * Aggregate seller dashboard stats:
 *  - totalShows: scheduled + live + ended (cancelled excluded)
 *  - totalSalesCents: sum of all completed listing sales (auctions won + spots reserved with status='paid')
 *  - itemsSold: count of listings where status='sold' or auctions ended with a winner
 */
/**
 * Aggregate seller-side stats for the dashboard.
 *
 * Sales are sourced from Orders (created when a break completes); itemsSold is
 * the count of OrderItem rows. We exclude cancelled orders so refunds don't
 * inflate revenue. totalShows counts every stream the seller has scheduled,
 * gone live with, or ended (cancelled excluded).
 */
export async function getSellerStats(sellerId: string) {
  const [totalShows, salesAgg, itemsSold] = await Promise.all([
    prisma.stream.count({
      where: { sellerId, status: { in: ["scheduled", "live", "ended"] } },
    }),
    prisma.order.aggregate({
      where: { sellerId, status: { not: "cancelled" } },
      _sum: { subtotalCents: true },
    }),
    prisma.orderItem.count({
      where: { order: { sellerId, status: { not: "cancelled" } } },
    }),
  ]);

  return {
    totalShows,
    totalSalesCents: salesAgg._sum.subtotalCents ?? 0,
    itemsSold,
  };
}

const LIVE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Transition a scheduled show to live: create the LiveKit room (if not present),
 * stamp startedAt, mint a publisher token. Allowed within 15 min of scheduledStartAt
 * (or any time after).
 */
export async function goLiveOnScheduledShow(showId: string, sellerId: string) {
  const stream = await prisma.stream.findUnique({
    where: { id: showId },
    include: {
      seller: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });

  if (!stream) throw new Error("SHOW_NOT_FOUND");
  if (stream.sellerId !== sellerId) throw new Error("NOT_AUTHORIZED");
  if (stream.status === "live") {
    const token = await createPublisherToken(
      stream.livekitRoomName,
      sellerId,
      stream.seller.displayName
    );
    return { stream, token };
  }
  if (stream.status !== "scheduled") throw new Error("SHOW_NOT_LIVEABLE");

  if (stream.scheduledStartAt) {
    const diff = stream.scheduledStartAt.getTime() - Date.now();
    if (diff > LIVE_WINDOW_MS) throw new Error("SHOW_TOO_EARLY");
  }

  try {
    await roomService.createRoom({ name: stream.livekitRoomName });
  } catch (err) {
    logger.warn(err, "LiveKit room creation failed (may already exist)");
  }

  const updated = await prisma.stream.update({
    where: { id: showId },
    data: { status: "live", startedAt: new Date() },
    include: {
      seller: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });

  await redis.del(LIVE_STREAMS_CACHE_KEY).catch(() => {});

  const token = await createPublisherToken(
    updated.livekitRoomName,
    sellerId,
    updated.seller.displayName
  );

  return { stream: updated, token };
}
