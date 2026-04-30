import { Router, Response } from "express";
import { authenticate } from "../middleware/authenticate";
import { AuthenticatedRequest } from "../types";
import {
  EarningsError,
  getSellerEarningsSummary,
  listEarningsTransactions,
  listPayouts,
  requestPayout,
} from "../services/earnings.service";
import logger from "../lib/logger";

const router = Router();

// GET /api/seller/earnings — summary card data for the dashboard
router.get(
  "/earnings",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const summary = await getSellerEarningsSummary(req.user!.userId);
      res.json(summary);
    } catch (err) {
      logger.error(err, "Get earnings summary error");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    }
  }
);

// GET /api/seller/earnings/transactions — recent ledger entries
router.get(
  "/earnings/transactions",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const txns = await listEarningsTransactions(req.user!.userId);
      res.json({ transactions: txns });
    } catch (err) {
      logger.error(err, "Get earnings transactions error");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    }
  }
);

// GET /api/seller/payouts — payout history
router.get(
  "/payouts",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const payouts = await listPayouts(req.user!.userId);
      res.json({ payouts });
    } catch (err) {
      logger.error(err, "Get payouts error");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    }
  }
);

// POST /api/seller/payouts/request — initiate withdrawal of available earnings
router.post(
  "/payouts/request",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await requestPayout(req.user!.userId);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof EarningsError) {
        const map: Record<string, number> = {
          BELOW_MINIMUM: 400,
          USER_NOT_FOUND: 404,
        };
        const status = map[err.code] ?? 400;
        res.status(status).json({ error: { code: err.code, message: err.message } });
        return;
      }
      logger.error(err, "Request payout error");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    }
  }
);

export default router;
