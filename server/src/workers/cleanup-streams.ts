import prisma from "../lib/prisma";
import redis from "../lib/redis";
import logger from "../lib/logger";

const ONE_HOUR_MS = 60 * 60 * 1000;

export async function cleanupStreams(): Promise<number> {
  const liveStreams = await prisma.stream.findMany({
    where: { status: "live" },
  });

  let cleaned = 0;
  for (const stream of liveStreams) {
    try {
      const viewersRaw = await redis.get(`stream:${stream.id}:viewers`);
      const viewerCount = viewersRaw ? parseInt(viewersRaw, 10) : 0;

      // Only clean up streams that have been live for over 1 hour with no viewers
      const liveFor = Date.now() - (stream.startedAt?.getTime() ?? Date.now());
      if (viewerCount <= 0 && liveFor > ONE_HOUR_MS) {
        await prisma.stream.update({
          where: { id: stream.id },
          data: { status: "ended", endedAt: new Date() },
        });
        await redis.del(`stream:${stream.id}:viewers`);
        cleaned++;
        logger.info(`Cleaned up stale stream ${stream.id}`);
      }
    } catch (err) {
      logger.error(err, `Failed to cleanup stream ${stream.id}`);
    }
  }

  return cleaned;
}
