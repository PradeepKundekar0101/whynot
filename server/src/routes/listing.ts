import { Router, Response } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { AuthenticatedRequest } from "../types";
import {
  createListing,
  reserveSpot,
  randomizeSpots,
  getListingsForStream,
  closeAuction,
} from "../services/listing.service";

const router = Router();

const createListingSchema = z.object({
  streamId: z.string().uuid(),
  type: z.enum(["auction", "break", "fixed_price", "giveaway"]),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  startingBid: z.number().int().min(1).optional(),
  bidIncrement: z.number().int().min(1).optional(),
  durationSeconds: z.number().int().min(10).max(3600).optional(),
  totalSpots: z.number().int().min(1).max(100).optional(),
  pricePerSpot: z.number().int().min(1).optional(),
  price: z.number().int().min(1).optional(),
  inventory: z.number().int().min(1).optional(),
});

// POST /api/listings — create listing
router.post(
  "/",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = createListingSchema.safeParse(req.body);
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
      const listing = await createListing(
        parsed.data.streamId,
        req.user!.userId,
        parsed.data
      );
      res.status(201).json({ listing });
    } catch (err: any) {
      if (err.message === "INVALID_STREAM") {
        res.status(400).json({
          error: {
            code: "INVALID_STREAM",
            message: "Stream not found, not live, or not yours",
          },
        });
        return;
      }
      console.error("Create listing error:", err);
      res
        .status(500)
        .json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    }
  }
);

// GET /api/listings/stream/:streamId — get listings for a stream
router.get("/stream/:streamId", async (req, res) => {
  try {
    const listings = await getListingsForStream(req.params.streamId);
    res.json({ listings });
  } catch (err) {
    console.error("Get listings error:", err);
    res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  }
});

// POST /api/listings/:id/reserve-spot — buy a spot in a break
router.post(
  "/:id/reserve-spot",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await reserveSpot(req.params.id, req.user!.userId);
      res.json(result);
    } catch (err: any) {
      const errorMap: Record<
        string,
        { status: number; code: string; message: string }
      > = {
        LISTING_NOT_AVAILABLE: {
          status: 400,
          code: "LISTING_NOT_AVAILABLE",
          message: "Listing not available",
        },
        SOLD_OUT: {
          status: 409,
          code: "SOLD_OUT",
          message: "All spots have been sold",
        },
        INSUFFICIENT_FUNDS: {
          status: 402,
          code: "INSUFFICIENT_FUNDS",
          message: "Insufficient wallet balance",
        },
        INVALID_BREAK: {
          status: 400,
          code: "INVALID_BREAK",
          message: "Invalid break listing",
        },
      };
      const mapped = errorMap[err.message];
      if (mapped) {
        res
          .status(mapped.status)
          .json({ error: { code: mapped.code, message: mapped.message } });
        return;
      }
      console.error("Reserve spot error:", err);
      res
        .status(500)
        .json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    }
  }
);

// POST /api/listings/:id/randomize — randomize spots (seller only)
router.post(
  "/:id/randomize",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await randomizeSpots(req.params.id, req.user!.userId);
      res.json(result);
    } catch (err: any) {
      if (err.message === "NOT_AUTHORIZED") {
        res.status(403).json({
          error: { code: "NOT_AUTHORIZED", message: "Not your listing" },
        });
        return;
      }
      console.error("Randomize error:", err);
      res
        .status(500)
        .json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    }
  }
);

// POST /api/listings/:id/close — close auction (for testing/manual close)
router.post(
  "/:id/close",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await closeAuction(req.params.id);
      res.json(result);
    } catch (err: any) {
      console.error("Close auction error:", err);
      res
        .status(500)
        .json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    }
  }
);

export default router;
