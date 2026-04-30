import Stripe from "stripe";

export type { PaymentIntent } from "../../node_modules/stripe/cjs/resources/PaymentIntents.js";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  throw new Error("STRIPE_SECRET_KEY environment variable must be set");
}

const stripe: Stripe.Stripe = new Stripe(secretKey);

export default stripe;
