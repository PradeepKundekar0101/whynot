import { Worker, Queue } from "bullmq";
import Redis from "ioredis";
import logger from "../lib/logger";
import { closeExpiredAuctions } from "./close-auctions";
import { expireHolds } from "./expire-holds";
import { cleanupStreams } from "./cleanup-streams";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export async function startWorkers() {
  let connection: Redis;

  try {
    connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    // Verify connection is reachable before setting up workers
    await connection.ping();
    connection.on("error", (err) => logger.warn(err, "Worker Redis error"));
  } catch (err) {
    logger.warn("Workers not started — Redis not available");
    return;
  }

  const opts = { connection };

  // Close auctions — every 1 second
  const closeAuctionsQueue = new Queue("close-auctions", opts);
  await closeAuctionsQueue.upsertJobScheduler("close-auctions-scheduler", {
    every: 1000,
  });

  new Worker(
    "close-auctions",
    async () => {
      const count = await closeExpiredAuctions();
      if (count > 0) logger.info(`Closed ${count} expired auction(s)`);
    },
    opts
  );

  // Expire holds — every 10 seconds
  const expireHoldsQueue = new Queue("expire-holds", opts);
  await expireHoldsQueue.upsertJobScheduler("expire-holds-scheduler", {
    every: 10000,
  });

  new Worker(
    "expire-holds",
    async () => {
      const count = await expireHolds();
      if (count > 0) logger.info(`Released ${count} expired hold(s)`);
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

  logger.info("Background workers started");
}
