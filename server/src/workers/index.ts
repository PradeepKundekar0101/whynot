import { Worker, Queue } from "bullmq";
import Redis from "ioredis";
import logger from "../lib/logger";
import { endExpiredSpotAuctions } from "./end-spot-auctions";
import { cleanupStreams } from "./cleanup-streams";
import { releaseExpiredEscrows } from "./release-escrows";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export async function startWorkers() {
  let connection: Redis;

  try {
    connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    await connection.ping();
    connection.on("error", (err) => logger.warn(err, "Worker Redis error"));
  } catch {
    logger.warn("Workers not started — Redis not available");
    return;
  }

  const opts = { connection };

  // End spot auctions whose timer has elapsed — every 1 second
  const endAuctionsQueue = new Queue("end-spot-auctions", opts);
  await endAuctionsQueue.upsertJobScheduler("end-spot-auctions-scheduler", {
    every: 1000,
  });

  new Worker(
    "end-spot-auctions",
    async () => {
      const count = await endExpiredSpotAuctions();
      if (count > 0) logger.info(`Ended ${count} spot auction(s)`);
    },
    opts
  );

  // Cleanup streams — every 5 minutes
  const cleanupQueue = new Queue("cleanup-streams", opts);
  await cleanupQueue.upsertJobScheduler("cleanup-streams-scheduler", {
    every: 300_000,
  });

  new Worker(
    "cleanup-streams",
    async () => {
      const count = await cleanupStreams();
      if (count > 0) logger.info(`Cleaned up ${count} stale stream(s)`);
    },
    opts
  );

  // Release expired escrows — every 60 seconds
  const releaseQueue = new Queue("release-escrows", opts);
  await releaseQueue.upsertJobScheduler("release-escrows-scheduler", {
    every: 60_000,
  });

  new Worker(
    "release-escrows",
    async () => {
      const count = await releaseExpiredEscrows();
      if (count > 0) logger.info(`Released ${count} expired escrow(s)`);
    },
    opts
  );

  logger.info("Background workers started");
}
