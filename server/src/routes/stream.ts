import { Router, Response } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { AuthenticatedRequest } from "../types";
import {
  createStream,
  joinStream,
  leaveStream,
  endStream,
  getLiveStreams,
  getStreamById,
  resumeOwnStream,
  getBroadcasterToken,
} from "../services/stream.service";
import {
  scheduleShow,
  updateScheduledShow,
  cancelScheduledShow,
  getUpcomingShows,
  getPastShows,
  getSellerStats,
  goLiveOnScheduledShow,
} from "../services/show.service";
import { getStreamStats } from "../services/stream-stats.service";
import prisma from "../lib/prisma";
import logger from "../lib/logger";

const router = Router();

const createStreamSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  category: z.string().min(1, "Category is required").max(50),
});

// POST /api/streams — go live (legacy ad-hoc flow, used by /seller/go-live)
router.post("/", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = createStreamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid input",
        details: parsed.error.errors.map(e => ({ field: e.path.join("."), message: e.message })) },
    });
    return;
  }

  try {
    const result = await createStream(req.user!.userId, parsed.data.title, parsed.data.category);
    res.status(201).json({ stream: result.stream, token: result.token });
  } catch (err) {
    logger.error(err, "Create stream error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

const scheduleShowSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(120),
  description: z.string().max(2000).optional(),
  scheduledStartAt: z
    .string()
    .datetime({ offset: true, message: "Must be a valid ISO datetime" })
    .refine((d) => new Date(d).getTime() > Date.now(), {
      message: "Show must be scheduled in the future",
    }),
  scheduledEndAt: z.string().datetime({ offset: true }).optional(),
  primaryCategory: z.string().min(1, "Category is required"),
  primarySubcategory: z.string().optional(),
  primarySellingFormat: z
    .string()
    .refine((v) => v === "breaks", {
      message: "Only Breaks format is currently supported",
    }),
  tags: z.array(z.string()).max(5, "Up to 5 tags allowed").default([]),
  thumbnailUrl: z.string().url("Thumbnail URL is required"),
  videoPreviewUrl: z.string().url().optional(),
  moderatorIds: z.array(z.string()).optional(),
  freePickupEnabled: z.boolean().optional(),
  pickupAddressId: z.string().optional(),
  pickupInstructions: z.string().max(500).optional(),
  domesticShippingFee: z.number().int().min(0).max(100000).optional(),
  combinedShippingEnabled: z.boolean().optional(),
  isAdultContent: z.boolean().optional(),
  allowChatReplays: z.boolean().optional(),
  recordingEnabled: z.boolean().optional(),
  notifyFollowers: z.boolean().optional(),
  boostEnabled: z.boolean().optional(),
  repeatRule: z.string().optional(),
});

async function ensureSellerEnabled(userId: string, res: Response): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSellerEnabled: true },
  });
  if (!user?.isSellerEnabled) {
    res.status(403).json({
      error: { code: "SELLER_NOT_ENABLED", message: "Enable seller mode to schedule shows" },
    });
    return false;
  }
  return true;
}

// POST /api/streams/schedule — create a scheduled show
router.post("/schedule", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  if (!(await ensureSellerEnabled(req.user!.userId, res))) return;

  const parsed = scheduleShowSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: parsed.error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      },
    });
    return;
  }

  try {
    const stream = await scheduleShow(req.user!.userId, {
      ...parsed.data,
      primarySellingFormat: "breaks",
      scheduledStartAt: new Date(parsed.data.scheduledStartAt),
      scheduledEndAt: parsed.data.scheduledEndAt
        ? new Date(parsed.data.scheduledEndAt)
        : undefined,
    });
    res.status(201).json({ stream });
  } catch (err: any) {
    if (err.message === "SHOW_CONFLICT") {
      res.status(409).json({
        error: {
          code: "SHOW_CONFLICT",
          message: `You already have a show "${err.conflict.title}" scheduled near this time`,
          details: err.conflict,
        },
      });
      return;
    }
    logger.error(err, "Schedule show error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// GET /api/streams/upcoming — caller's scheduled+live shows
router.get("/upcoming", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const shows = await getUpcomingShows(req.user!.userId);
    res.json({ shows });
  } catch (err) {
    logger.error(err, "Get upcoming shows error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// GET /api/streams/past — caller's ended/cancelled shows
router.get("/past", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const shows = await getPastShows(req.user!.userId);
    res.json({ shows });
  } catch (err) {
    logger.error(err, "Get past shows error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// GET /api/streams/seller/stats — seller dashboard stats
router.get("/seller/stats", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await getSellerStats(req.user!.userId);
    res.json(stats);
  } catch (err) {
    logger.error(err, "Get seller stats error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// GET /api/streams/me/active — caller's own currently-live stream (for resume after reload)
router.get("/me/active", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await resumeOwnStream(req.user!.userId);
    if (!result) {
      res.json({ stream: null, token: null });
      return;
    }
    res.json({ stream: result.stream, token: result.token });
  } catch (err) {
    logger.error(err, "Resume own stream error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// GET /api/streams/live
router.get("/live", async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const streams = await getLiveStreams(category);
    res.json({ streams });
  } catch (err) {
    logger.error(err, "Live streams error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// POST /api/streams/:id/go-live — transition scheduled → live
router.post(
  "/:id/go-live",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await goLiveOnScheduledShow(req.params.id, req.user!.userId);
      res.json({ stream: result.stream, token: result.token });
    } catch (err: any) {
      const map: Record<string, { status: number; code: string; message: string }> = {
        SHOW_NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "Show not found" },
        NOT_AUTHORIZED: { status: 403, code: "NOT_AUTHORIZED", message: "Not your show" },
        SHOW_NOT_LIVEABLE: {
          status: 409,
          code: "SHOW_NOT_LIVEABLE",
          message: "This show cannot go live (already ended or cancelled)",
        },
        SHOW_TOO_EARLY: {
          status: 409,
          code: "SHOW_TOO_EARLY",
          message: "Go Live is only available within 15 minutes of the scheduled start",
        },
      };
      const m = map[err.message];
      if (m) {
        res.status(m.status).json({ error: { code: m.code, message: m.message } });
        return;
      }
      logger.error(err, "Go live error");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    }
  }
);

// PATCH /api/streams/:id — edit scheduled show
const updateShowSchema = scheduleShowSchema.partial();
router.patch("/:id", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = updateShowSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: parsed.error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      },
    });
    return;
  }

  try {
    const updated = await updateScheduledShow(req.params.id, req.user!.userId, {
      ...parsed.data,
      scheduledStartAt: parsed.data.scheduledStartAt
        ? new Date(parsed.data.scheduledStartAt)
        : undefined,
      scheduledEndAt: parsed.data.scheduledEndAt
        ? new Date(parsed.data.scheduledEndAt)
        : undefined,
    });
    res.json({ stream: updated });
  } catch (err: any) {
    const map: Record<string, { status: number; code: string; message: string }> = {
      SHOW_NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "Show not found" },
      NOT_AUTHORIZED: { status: 403, code: "NOT_AUTHORIZED", message: "Not your show" },
      SHOW_NOT_EDITABLE: {
        status: 409,
        code: "SHOW_NOT_EDITABLE",
        message: "Only scheduled shows can be edited",
      },
      SHOW_CONFLICT: {
        status: 409,
        code: "SHOW_CONFLICT",
        message: "You already have a show scheduled near this time",
      },
    };
    const m = map[err.message];
    if (m) {
      res.status(m.status).json({ error: { code: m.code, message: m.message } });
      return;
    }
    logger.error(err, "Update show error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// DELETE /api/streams/:id — cancel scheduled show
router.delete("/:id", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cancelled = await cancelScheduledShow(req.params.id, req.user!.userId);
    res.json({ stream: cancelled });
  } catch (err: any) {
    const map: Record<string, { status: number; code: string; message: string }> = {
      SHOW_NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "Show not found" },
      NOT_AUTHORIZED: { status: 403, code: "NOT_AUTHORIZED", message: "Not your show" },
      SHOW_NOT_CANCELLABLE: {
        status: 409,
        code: "SHOW_NOT_CANCELLABLE",
        message: "Only scheduled shows can be cancelled",
      },
    };
    const m = map[err.message];
    if (m) {
      res.status(m.status).json({ error: { code: m.code, message: m.message } });
      return;
    }
    logger.error(err, "Cancel show error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// GET /api/streams/:id/stats — live stream revenue (public; updated via WS)
router.get("/:id/stats", async (req, res) => {
  try {
    const stats = await getStreamStats(req.params.id);
    res.json(stats);
  } catch (err) {
    logger.error(err, "Get stream stats error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// GET /api/streams/:id
router.get("/:id", async (req, res) => {
  try {
    const stream = await getStreamById(req.params.id);
    res.json({ stream });
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Stream not found" } });
      return;
    }
    logger.error(err, "Get stream error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// POST /api/streams/:id/broadcaster-token — fresh publisher token for the seller (resume after reload)
router.post(
  "/:id/broadcaster-token",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await getBroadcasterToken(req.params.id, req.user!.userId);
      res.json({ stream: result.stream, token: result.token });
    } catch (err: any) {
      const map: Record<string, { status: number; code: string; message: string }> = {
        STREAM_NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "Stream not found" },
        NOT_AUTHORIZED: { status: 403, code: "NOT_AUTHORIZED", message: "Not your stream" },
        STREAM_NOT_LIVE: { status: 409, code: "STREAM_NOT_LIVE", message: "Stream is not live" },
      };
      const m = map[err.message];
      if (m) {
        res.status(m.status).json({ error: { code: m.code, message: m.message } });
        return;
      }
      logger.error(err, "Broadcaster token error");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    }
  }
);

// POST /api/streams/:id/join
router.post("/:id/join", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await joinStream(req.params.id, req.user!.userId, req.user!.email);
    res.json(result);
  } catch (err: any) {
    if (err.message === "STREAM_NOT_LIVE") {
      res.status(400).json({ error: { code: "STREAM_NOT_LIVE", message: "Stream is not live" } });
      return;
    }
    logger.error(err, "Join stream error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// POST /api/streams/:id/leave
router.post("/:id/leave", authenticate, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await leaveStream(_req.params.id);
    res.json({ message: "Left stream" });
  } catch (err) {
    logger.error(err, "Leave stream error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// POST /api/streams/:id/end
router.post("/:id/end", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stream = await endStream(req.params.id, req.user!.userId);
    res.json({ stream });
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Stream not found or not yours" } });
      return;
    }
    logger.error(err, "End stream error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

export default router;
