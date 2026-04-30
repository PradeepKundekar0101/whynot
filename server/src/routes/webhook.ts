import { Router, Request, Response } from "express";
import Stripe from "stripe";
import stripe from "../lib/stripe";
import { creditWallet } from "../services/wallet.service";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    res.status(400).json({ error: "Missing signature or webhook secret" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const userId = paymentIntent.metadata.userId;
    const type = paymentIntent.metadata.type;

    if (userId && type === "wallet_topup") {
      try {
        await creditWallet(userId, paymentIntent.amount, paymentIntent.id, event.id);
      } catch (err) {
        console.error("Credit wallet error:", err);
        res.status(500).json({ error: "Failed to credit wallet" });
        return;
      }
    }
  }

  res.json({ received: true });
});

export default router;
