import { Router, Response } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { AuthenticatedRequest } from "../types";
import {
  BreakError,
  cancelBreak,
  createBreak,
  getBreakById,
  listBreaksForStream,
} from "../services/break.service";
import { emitToStream } from "../websocket/emitter";
import { paramAsString } from "../lib/express-params";
import { SHIPPING_PROFILES, SPOT_PRESETS } from "../lib/spot-presets";
import logger from "../lib/logger";

const router = Router();

const spotInputSchema = z.object({
  spotName: z.string().min(1).max(100),
  startingPrice: z.number().int().min(1).max(10_000_000),
  description: z.string().max(500).optional(),
});

const createBreakSchema = z.object({
  streamId: z.string().uuid(),
  breakName: z.string().min(1).max(120),
  breakDescription: z.string().max(2000).optional(),
  sellingMode: z.enum(["auction", "buy_it_now"]),
  breakFormat: z.enum(["pick_your", "random"]),
  spotPreset: z.string().optional(),
  shippingProfile: z.string(),
  autoRandomize: z.boolean().optional(),
  quickSpin: z.boolean().optional(),
  spots: z.array(spotInputSchema).min(1).max(500),
});

const ERROR_MAP: Record<string, { status: number; message: string }> = {
  STREAM_NOT_FOUND: { status: 404, message: "Stream not found" },
  NOT_AUTHORIZED: { status: 403, message: "You don't own this stream" },
  NO_SPOTS: { status: 400, message: "A break needs at least one spot" },
  TOO_MANY_SPOTS: { status: 400, message: "A break can have at most 500 spots" },
  INVALID_PRESET: { status: 400, message: "Unknown spot preset" },
  INVALID_SHIPPING_PROFILE: { status: 400, message: "Unknown shipping profile" },
  EMPTY_SPOT_NAME: { status: 400, message: "Spot names cannot be empty" },
  DUPLICATE_SPOT_NAME: { status: 400, message: "Duplicate spot name" },
  INVALID_STARTING_PRICE: { status: 400, message: "Each spot needs a starting price of at least $0.01" },
  BREAK_NOT_FOUND: { status: 404, message: "Break not found" },
  BREAK_ALREADY_COMPLETED: { status: 409, message: "Break already completed" },
};

function handleError(res: Response, err: unknown) {
  if (err instanceof BreakError) {
    const map = ERROR_MAP[err.code];
    if (map) {
      res.status(map.status).json({
        error: { code: err.code, message: map.message, ...(err.context as object) },
      });
      return;
    }
    res.status(400).json({ error: { code: err.code, message: err.code, ...(err.context as object) } });
    return;
  }
  logger.error(err, "Break route error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
}

// GET /api/breaks/presets — list spot presets + shipping profiles for the seller UI
router.get("/presets", (_req, res) => {
  res.json({
    presets: Object.fromEntries(
      Object.entries(SPOT_PRESETS).map(([key, names]) => [key, [...names]])
    ),
    shippingProfiles: SHIPPING_PROFILES,
  });
});

// GET /api/breaks/stream/:streamId — list all breaks (with their spots) in a stream
router.get("/stream/:streamId", async (req, res) => {
  try {
    const breaks = await listBreaksForStream(paramAsString(req.params.streamId));
    res.json({ breaks });
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/breaks/:id — single break with spots
router.get("/:id", async (req, res) => {
  try {
    const data = await getBreakById(paramAsString(req.params.id));
    if (!data) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Break not found" } });
      return;
    }
    res.json({ break: data });
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/breaks — create a new break
router.post(
  "/",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = createBreakSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: parsed.error.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
      });
      return;
    }

    try {
      const listing = await createBreak(req.user!.userId, parsed.data);
      emitToStream(listing.streamId, "break:created", { listing });
      res.status(201).json({ break: listing });
    } catch (err) {
      handleError(res, err);
    }
  }
);

// DELETE /api/breaks/:id — cancel a break (releases all active holds)
router.delete(
  "/:id",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await cancelBreak(paramAsString(req.params.id), req.user!.userId);
      res.json({ ok: true });
    } catch (err) {
      handleError(res, err);
    }
  }
);

export default router;
