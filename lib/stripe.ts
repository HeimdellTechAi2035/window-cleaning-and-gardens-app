import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeClient) return stripeClient;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured");
  stripeClient = new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });
  return stripeClient;
}

export async function findOrCreateStripeCustomer(params: {
  existingStripeCustomerId?: string | null;
  email?: string | null;
  name: string;
  phone?: string | null;
}) {
  const stripe = getStripe();
  if (params.existingStripeCustomerId) {
    return stripe.customers.retrieve(params.existingStripeCustomerId) as Promise<Stripe.Customer>;
  }
  return stripe.customers.create({
    email: params.email ?? undefined,
    name: params.name,
    phone: params.phone ?? undefined,
  });
}

/**
 * Creates a hosted Stripe Checkout session for a one-off job payment.
 * The resulting `url` is what gets sent to the customer via SMS/email.
 */
export async function createCheckoutSession(params: {
  stripeCustomerId: string;
  amountPence: number;
  currency?: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}) {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    mode: "payment",
    customer: params.stripeCustomerId,
    line_items: [
      {
        price_data: {
          currency: params.currency ?? "gbp",
          product_data: { name: params.description },
          unit_amount: params.amountPence,
        },
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata,
  });
}

/**
 * Charges a customer's saved default payment method off-session,
 * used to automatically bill a job on completion.
 */
export async function chargeSavedCard(params: {
  stripeCustomerId: string;
  paymentMethodId: string;
  amountPence: number;
  currency?: string;
  description: string;
  metadata: Record<string, string>;
}) {
  const stripe = getStripe();
  return stripe.paymentIntents.create({
    amount: params.amountPence,
    currency: params.currency ?? "gbp",
    customer: params.stripeCustomerId,
    payment_method: params.paymentMethodId,
    off_session: true,
    confirm: true,
    description: params.description,
    metadata: params.metadata,
  });
}

export function constructStripeWebhookEvent(rawBody: string, signature: string) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
