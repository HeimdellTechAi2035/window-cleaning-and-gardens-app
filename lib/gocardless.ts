import gocardless, { Environments, parse, type Event as GoCardlessEvent } from "gocardless-nodejs";

let client: ReturnType<typeof gocardless> | null = null;

function getClient() {
  if (client) return client;
  const accessToken = process.env.GOCARDLESS_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("GOCARDLESS_ACCESS_TOKEN is not configured");
  }
  const env = process.env.GOCARDLESS_ENV === "live" ? Environments.Live : Environments.Sandbox;
  client = gocardless(accessToken, env);
  return client;
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

export async function createGoCardlessCustomer(input: CreateCustomerInput) {
  const gc = getClient();
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
export async function createMandateRedirectFlow(params: {
  customerId: string;
  sessionToken: string;
  successRedirectUrl: string;
  description: string;
}) {
  const gc = getClient();
  const flow = await gc.redirectFlows.create({
    description: params.description,
    session_token: params.sessionToken,
    success_redirect_url: params.successRedirectUrl,
  });
  return flow;
}

export async function completeMandateRedirectFlow(params: {
  redirectFlowId: string;
  sessionToken: string;
}) {
  const gc = getClient();
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
export async function createGoCardlessPayment(params: {
  mandateId: string;
  amountPence: number;
  currency?: "GBP" | "EUR" | "USD" | "AUD" | "CAD" | "DKK" | "NZD" | "SEK";
  description: string;
  metadata?: Record<string, string>;
}) {
  const gc = getClient();
  const payment = await gc.payments.create({
    amount: String(params.amountPence),
    currency: params.currency ?? "GBP",
    links: { mandate: params.mandateId },
    description: params.description,
    metadata: params.metadata,
  });
  return payment;
}

export async function getMandate(mandateId: string) {
  const gc = getClient();
  return gc.mandates.find(mandateId);
}

export async function cancelMandate(mandateId: string) {
  const gc = getClient();
  return gc.mandates.cancel(mandateId, {});
}

/**
 * Verifies and parses an inbound GoCardless webhook body using the
 * official SDK helper, which checks the `Webhook-Signature` header via
 * HMAC-SHA256 and throws if it doesn't match.
 */
export function parseGoCardlessWebhook(
  rawBody: string,
  signatureHeader: string | null
): GoCardlessEvent[] {
  if (!signatureHeader) throw new Error("Missing Webhook-Signature header");
  const secret = process.env.GOCARDLESS_WEBHOOK_SECRET;
  if (!secret) throw new Error("GOCARDLESS_WEBHOOK_SECRET is not configured");

  return parse(rawBody, secret, signatureHeader);
}

export type GoCardlessWebhookEvent = GoCardlessEvent;
