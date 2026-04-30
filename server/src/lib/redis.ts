import Redis from "ioredis";
import logger from "./logger";

export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/** Shared client; use lazyConnect so listeners attach before connect (avoids ioredis unhandled error noise). */
const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

redis.on("error", (err) => {
  logger.error(err, "Redis connection error");
});

export async function connectRedis(): Promise<void> {
  await redis.connect();
  await redis.ping();
  logger.info({ url: REDIS_URL }, "Redis connected");
}

export default redis;
