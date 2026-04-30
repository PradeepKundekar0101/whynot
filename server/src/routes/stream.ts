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
} from "../services/stream.service";

const router = Router();

const createStreamSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  category: z.string().min(1, "Category is required").max(50),
});

// POST /api/streams — go live
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
    console.error("Create stream error:", err);
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
    console.error("Live streams error:", err);
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
    console.error("Get stream error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

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
    console.error("Join stream error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// POST /api/streams/:id/leave
router.post("/:id/leave", authenticate, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await leaveStream(_req.params.id);
    res.json({ message: "Left stream" });
  } catch (err) {
    console.error("Leave stream error:", err);
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
    console.error("End stream error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

export default router;
