import { Router } from "express";
import prisma from "../lib/prisma";
import logger from "../lib/logger";

const router = Router();

// GET /api/streams/:streamId/chat — recent unified chat feed (user messages + system events)
router.get("/:streamId/chat", async (req, res) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { streamId: req.params.streamId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Hydrate user info for the message authors.
    const userIds = [
      ...new Set(messages.map((m) => m.userId).filter((id): id is string => !!id)),
    ];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const enriched = messages.reverse().map((m) => {
      if (m.type === "system") {
        return {
          id: m.id,
          type: "system" as const,
          streamId: m.streamId,
          eventType: m.eventType,
          eventData: m.eventData,
          createdAt: m.createdAt.toISOString(),
        };
      }
      const user = m.userId ? userMap.get(m.userId) : null;
      return {
        id: m.id,
        type: "user" as const,
        streamId: m.streamId,
        userId: m.userId,
        username: user?.username || "unknown",
        displayName: user?.displayName || "Unknown",
        avatarUrl: user?.avatarUrl ?? null,
        text: m.text,
        createdAt: m.createdAt.toISOString(),
      };
    });

    res.json({ messages: enriched });
  } catch (err) {
    logger.error(err, "Chat history error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

export default router;
