import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

// GET /api/streams/:streamId/chat — get recent chat messages
router.get("/:streamId/chat", async (req, res) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { streamId: req.params.streamId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Fetch user info for each unique userId
    const userIds = [...new Set(messages.map((m) => m.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const enriched = messages.reverse().map((m) => {
      const user = userMap.get(m.userId);
      return {
        id: m.id,
        streamId: m.streamId,
        userId: m.userId,
        username: user?.username || "unknown",
        displayName: user?.displayName || "Unknown",
        avatarUrl: user?.avatarUrl,
        text: m.text,
        createdAt: m.createdAt.toISOString(),
      };
    });

    res.json({ messages: enriched });
  } catch (err) {
    console.error("Chat history error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

export default router;
