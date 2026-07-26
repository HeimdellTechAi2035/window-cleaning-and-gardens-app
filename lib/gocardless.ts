import gocardless, { Environments, parse, type Event as GoCardlessEvent } from "gocardless-nodejs";

type GoCardlessClient = ReturnType<typeof gocardless>;

/**
 * Builds a GoCardless client from a specific organization's own access
 * token. There is deliberately no shared/global fallback client — every
 * mandate and payment must run through the organization that owns the
 * customer, so their money settles into their own account, not anyone
 * else's.
 */
export function getGoCardlessClient(accessToken: string, env: string): GoCardlessClient {
  return gocardless(accessToken, env === "live" ? Environments.Live : Environments.Sandbox);
}

export interface CreateCustomerInput {
  email: string;
  givenName: string;
  familyName: string;
  addressLine1?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
}

export async function createGoCardlessCustomer(gc: GoCardlessClient, input: CreateCustomerInput) {
  const customer = await gc.customers.create({
    email: input.email,
    given_name: input.givenName,
    family_name: input.familyName,
    address_line1: input.addressLine1,
    city: input.city,
    postal_code: input.postalCode,
    phone_number: input.phone,
    country_code: "GB",
  });
  return customer;
}

/**
 * Creates a redirect flow so the client can complete their Direct Debit
 * mandate signup via GoCardless's hosted page. The returned redirect_url
 * is what gets emailed/texted to the customer.
 */
export async function createMandateRedirectFlow(
  gc: GoCardlessClient,
  params: {
    customerId: string;
    sessionToken: string;
    successRedirectUrl: string;
    description: string;
  }
) {
  const flow = await gc.redirectFlows.create({
    description: params.description,
    session_token: params.sessionToken,
    success_redirect_url: params.successRedirectUrl,
  });
  return flow;
}

export async function completeMandateRedirectFlow(
  gc: GoCardlessClient,
  params: { redirectFlowId: string; sessionToken: string }
) {
  const flow = await gc.redirectFlows.complete(params.redirectFlowId, {
    session_token: params.sessionToken,
  });
  return flow; // flow.links.mandate is the mandate id
}

/**
 * Triggers an immediate Direct Debit charge against an active mandate.
 * Used automatically when a Job is marked COMPLETED for a customer
 * on a GoCardless mandate.
 */
export async function createGoCardlessPayment(
  gc: GoCardlessClient,
  params: {
    mandateId: string;
    amountPence: number;
    currency?: "GBP" | "EUR" | "USD" | "AUD" | "CAD" | "DKK" | "NZD" | "SEK";
    description: string;
    metadata?: Record<string, string>;
  }
) {
  const payment = await gc.payments.create({
    amount: String(params.amountPence),
    currency: params.currency ?? "GBP",
    links: { mandate: params.mandateId },
    description: params.description,
    metadata: params.metadata,
  });
  return payment;
}

export async function getMandate(gc: GoCardlessClient, mandateId: string) {
  return gc.mandates.find(mandateId);
}

export async function cancelMandate(gc: GoCardlessClient, mandateId: string) {
  return gc.mandates.cancel(mandateId, {});
}

/**
 * Verifies and parses an inbound GoCardless webhook body using the
 * official SDK helper, which checks the `Webhook-Signature` header via
 * HMAC-SHA256 and throws if it doesn't match.
 */
export function parseGoCardlessWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): GoCardlessEvent[] {
  if (!signatureHeader) throw new Error("Missing Webhook-Signature header");
  return parse(rawBody, secret, signatureHeader);
}

export type GoCardlessWebhookEvent = GoCardlessEvent;
