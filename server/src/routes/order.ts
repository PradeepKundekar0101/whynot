import { Router, Response } from "express";
import { paramAsString } from "../lib/express-params";
import { authenticate } from "../middleware/authenticate";
import { AuthenticatedRequest } from "../types";
import prisma from "../lib/prisma";
import logger from "../lib/logger";

const router = Router();

// GET /api/orders — buyer's order history
router.get("/", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      where: { buyerId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        listing: { select: { breakName: true, breakFormat: true } },
        seller: { select: { username: true, displayName: true, avatarUrl: true } },
        stream: { select: { id: true, title: true } },
      },
    });
    res.json({ orders });
  } catch (err) {
    logger.error(err, "List orders error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// GET /api/orders/:id — single order with full detail
router.get("/:id", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: paramAsString(req.params.id) },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        listing: { select: { breakName: true, breakFormat: true } },
        seller: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        buyer: { select: { id: true, username: true, displayName: true } },
        stream: { select: { id: true, title: true } },
      },
    });
    if (!order) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
      return;
    }
    if (order.buyerId !== req.user!.userId && order.sellerId !== req.user!.userId) {
      res.status(403).json({ error: { code: "NOT_AUTHORIZED", message: "Not your order" } });
      return;
    }
    res.json({ order });
  } catch (err) {
    logger.error(err, "Get order error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

export default router;
