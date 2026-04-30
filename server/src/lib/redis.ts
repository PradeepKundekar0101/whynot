import Redis from "ioredis";
import logger from "./logger";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

redis.on("error", (err) => {
  logger.error(err, "Redis connection error");
});

export default redis;
