import { getStripeClient } from "@/lib/stripe";

/**
 * RoundFlow's own subscription billing — a single, global Stripe account
 * (Heimdell Tech Ai Ltd's) that charges organizations to use the app.
 * Entirely separate from lib/stripe.ts's per-org clients, which are each
 * organization's own account for charging *their* customers.
 */
export function getPlatformStripe() {
  const secretKey = process.env.PLATFORM_STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("PLATFORM_STRIPE_SECRET_KEY is not configured");
  return getStripeClient(secretKey);
}

function getPlatformPriceId() {
  const priceId = process.env.PLATFORM_STRIPE_PRICE_ID;
  if (!priceId) throw new Error("PLATFORM_STRIPE_PRICE_ID is not configured");
  return priceId;
}

/** Fetches the live plan price/interval from Stripe for display on the subscribe page. */
export async function getPlanDetails() {
  const stripe = getPlatformStripe();
  const price = await stripe.prices.retrieve(getPlatformPriceId());
  return {
    amount: (price.unit_amount ?? 0) / 100,
    currency: price.currency.toUpperCase(),
    interval: price.recurring?.interval ?? "month",
  };
}

/**
 * Creates a Stripe Checkout session (subscription mode, 7-day trial) for
 * an organization to start paying for RoundFlow. `organizationId` travels
 * in `client_reference_id` so the webhook knows which org a completed
 * checkout belongs to.
 */
export async function createSubscriptionCheckoutSession(params: {
  organizationId: string;
  existingStripeCustomerId?: string | null;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const stripe = getPlatformStripe();
  return stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: params.organizationId,
    ...(params.existingStripeCustomerId
      ? { customer: params.existingStripeCustomerId }
      : { customer_email: params.customerEmail }),
    line_items: [{ price: getPlatformPriceId(), quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: { organizationId: params.organizationId },
    },
    metadata: { organizationId: params.organizationId },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
}

/**
 * Creates a Stripe Billing Portal session so an org admin can update their
 * card, view invoices, or cancel — using Stripe's own hosted UI.
 */
export async function createBillingPortalSession(params: {
  stripeCustomerId: string;
  returnUrl: string;
}) {
  const stripe = getPlatformStripe();
  return stripe.billingPortal.sessions.create({
    customer: params.stripeCustomerId,
    return_url: params.returnUrl,
  });
}

export function constructPlatformStripeWebhookEvent(rawBody: string, signature: string) {
  const stripe = getPlatformStripe();
  const webhookSecret = process.env.PLATFORM_STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("PLATFORM_STRIPE_WEBHOOK_SECRET is not configured");
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
