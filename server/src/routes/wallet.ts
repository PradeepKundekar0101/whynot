import { Router, Request, Response } from "express";
import { z } from "zod";
import Stripe from "stripe";
import stripe from "../lib/stripe";
import { authenticate } from "../middleware/authenticate";
import { AuthenticatedRequest } from "../types";
import {
  createTopupIntent,
  creditWallet,
  getWalletBalance,
  getWalletTransactions,
} from "../services/wallet.service";

const router = Router();

const topupSchema = z.object({
  amountCents: z.number().int().min(100, "Minimum top-up is $1.00").max(100000, "Maximum top-up is $1,000.00"),
});

// GET /api/wallet/balance
router.get("/balance", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const balance = await getWalletBalance(req.user!.userId);
    res.json({ balance });
  } catch (err) {
    console.error("Balance error:", err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
    });
  }
});

// GET /api/wallet/transactions
router.get("/transactions", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const transactions = await getWalletTransactions(req.user!.userId, limit, offset);
    res.json({ transactions });
  } catch (err) {
    console.error("Transactions error:", err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
    });
  }
});

// POST /api/wallet/topup
router.post("/topup", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = topupSchema.safeParse(req.body);
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
    const result = await createTopupIntent(req.user!.userId, parsed.data.amountCents);
    res.json(result);
  } catch (err: any) {
    if (err.message === "MINIMUM_AMOUNT") {
      res.status(400).json({
        error: { code: "MINIMUM_AMOUNT", message: "Minimum top-up is $1.00" },
      });
      return;
    }
    if (err.message === "MAXIMUM_AMOUNT") {
      res.status(400).json({
        error: { code: "MAXIMUM_AMOUNT", message: "Maximum top-up is $1,000.00" },
      });
      return;
    }
    console.error("Topup error:", err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
    });
  }
});

export default router;
