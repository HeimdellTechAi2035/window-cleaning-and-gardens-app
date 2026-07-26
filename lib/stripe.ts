import Stripe from "stripe";

/**
 * Builds a Stripe client from a specific organization's own secret key.
 * There is deliberately no shared/global fallback client — every payment
 * must run through the organization that owns the customer, so their
 * money settles into their own Stripe account, not anyone else's.
 */
export function getStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });
}

export async function findOrCreateStripeCustomer(
  stripe: Stripe,
  params: {
    existingStripeCustomerId?: string | null;
    email?: string | null;
    name: string;
    phone?: string | null;
  }
) {
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
export async function createCheckoutSession(
  stripe: Stripe,
  params: {
    stripeCustomerId: string;
    amountPence: number;
    currency?: string;
    description: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }
) {
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
export async function chargeSavedCard(
  stripe: Stripe,
  params: {
    stripeCustomerId: string;
    paymentMethodId: string;
    amountPence: number;
    currency?: string;
    description: string;
    metadata: Record<string, string>;
  }
) {
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

export function constructStripeWebhookEvent(
  stripe: Stripe,
  rawBody: string,
  signature: string,
  webhookSecret: string
) {
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
