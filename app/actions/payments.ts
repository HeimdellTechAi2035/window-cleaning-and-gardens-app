"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createGoCardlessCustomer, createMandateRedirectFlow, getGoCardlessClient } from "@/lib/gocardless";
import { findOrCreateStripeCustomer, getStripeClient, createCheckoutSession } from "@/lib/stripe";
import { sendEmail, sendSms, mandateInviteEmail, notifyBestEffort } from "@/lib/twilio";

async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  return session;
}

async function requireOrgWithGoCardless(organizationId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (!org.gocardlessAccessToken) {
    throw new Error("Add your GoCardless access token in Settings before sending Direct Debit invites.");
  }
  return org;
}

async function requireOrgWithStripe(organizationId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (!org.stripeSecretKey) {
    throw new Error("Add your Stripe secret key in Settings before sending payment links.");
  }
  return org;
}

// Thrown Errors from Server Actions don't reliably reach the client in
// production when the action also revalidates the current route — so
// each exported action below wraps its real logic and returns
// { error: string } on failure instead of throwing.
export async function sendDirectDebitInviteAction(
  customerId: string
): Promise<{ mandateUrl: string } | { error: string }> {
  try {
    return await sendDirectDebitInviteActionInner(customerId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to send Direct Debit invite" };
  }
}

/**
 * Generates a GoCardless Direct Debit mandate signup link and emails/texts
 * it to the customer. The customer completes the mandate on GoCardless's
 * hosted page; the `mandates` webhook then flips mandateStatus to "active".
 */
async function sendDirectDebitInviteActionInner(customerId: string) {
  const session = await requireSession();
  const org = await requireOrgWithGoCardless(session.user.organizationId);
  const gc = getGoCardlessClient(org.gocardlessAccessToken!, org.gocardlessEnv);

  const customer = await prisma.customer.findFirstOrThrow({
    where: { id: customerId, organizationId: session.user.organizationId },
  });

  let gocardlessCustomerId = customer.gocardlessCustomerId;
  if (!gocardlessCustomerId) {
    const gcCustomer = await createGoCardlessCustomer(gc, {
      email: customer.email ?? `${customer.id}@placeholder.roundflow.app`,
      givenName: customer.firstName,
      familyName: customer.lastName,
      addressLine1: customer.billingAddressLine1 ?? undefined,
      city: customer.billingCity ?? undefined,
      postalCode: customer.billingPostcode ?? undefined,
      phone: customer.phone ?? undefined,
    });
    gocardlessCustomerId = gcCustomer.id!;
    await prisma.customer.update({
      where: { id: customer.id },
      data: { gocardlessCustomerId },
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const sessionToken = `${customer.id}-${Date.now()}`;

  const flow = await createMandateRedirectFlow(gc, {
    customerId: gocardlessCustomerId,
    sessionToken,
    successRedirectUrl: `${baseUrl}/portal/${customer.portalToken}?mandate=complete&session=${sessionToken}`,
    description: "Direct Debit mandate for recurring service payments",
  });

  const mandateUrl = flow.redirect_url!;

  if (customer.email) {
    await notifyBestEffort("mandate invite email", () =>
      sendEmail({
        to: customer.email!,
        subject: "Set up your Direct Debit",
        html: mandateInviteEmail({ customerName: customer.firstName, mandateUrl }),
      })
    );
  }
  if (customer.phone) {
    await notifyBestEffort("mandate invite sms", () =>
      sendSms({
        to: customer.phone!,
        body: `Hi ${customer.firstName}, please set up Direct Debit here: ${mandateUrl}`,
      })
    );
  }

  await prisma.notification.create({
    data: {
      customerId: customer.id,
      type: "MANDATE_INVITE",
      channel: customer.email ? "EMAIL" : "SMS",
      recipient: customer.email ?? customer.phone ?? "",
      body: mandateUrl,
      status: "sent",
      sentAt: new Date(),
    },
  });

  revalidatePath(`/customers/${customer.id}`);
  return { mandateUrl };
}

export async function createStripeSetupIntentAction(
  customerId: string
): Promise<{ clientSecret: string | null } | { error: string }> {
  try {
    return await createStripeSetupIntentActionInner(customerId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to start card setup" };
  }
}

/**
 * Creates (or reuses) a Stripe customer and returns a SetupIntent client
 * secret so the dashboard can collect a card on file for future
 * off-session charges triggered by job completion.
 */
async function createStripeSetupIntentActionInner(customerId: string) {
  const session = await requireSession();
  const org = await requireOrgWithStripe(session.user.organizationId);
  const stripe = getStripeClient(org.stripeSecretKey!);

  const customer = await prisma.customer.findFirstOrThrow({
    where: { id: customerId, organizationId: session.user.organizationId },
  });

  const stripeCustomer = await findOrCreateStripeCustomer(stripe, {
    existingStripeCustomerId: customer.stripeCustomerId,
    email: customer.email,
    name: `${customer.firstName} ${customer.lastName}`,
    phone: customer.phone,
  });

  if (!customer.stripeCustomerId) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { stripeCustomerId: stripeCustomer.id },
    });
  }

  const setupIntent = await stripe.setupIntents.create({
    customer: stripeCustomer.id,
    payment_method_types: ["card"],
  });

  return { clientSecret: setupIntent.client_secret };
}

export async function sendPaymentLinkAction(params: {
  customerId: string;
  amount: number;
  description: string;
}): Promise<{ paymentUrl: string; qrCodeDataUrl: string } | { error: string }> {
  try {
    return await sendPaymentLinkActionInner(params);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to send payment link" };
  }
}

/**
 * Creates a one-off Stripe Checkout link for an arbitrary amount (not
 * tied to a specific job), sends it to the customer via SMS/email, and
 * returns a QR code image of the link so a worker can also show/scan it
 * in person on-site.
 */
async function sendPaymentLinkActionInner(params: {
  customerId: string;
  amount: number;
  description: string;
}) {
  const session = await requireSession();
  const org = await requireOrgWithStripe(session.user.organizationId);
  const stripe = getStripeClient(org.stripeSecretKey!);

  const customer = await prisma.customer.findFirstOrThrow({
    where: { id: params.customerId, organizationId: session.user.organizationId },
  });

  const stripeCustomer = await findOrCreateStripeCustomer(stripe, {
    existingStripeCustomerId: customer.stripeCustomerId,
    email: customer.email,
    name: `${customer.firstName} ${customer.lastName}`,
    phone: customer.phone,
  });

  if (!customer.stripeCustomerId) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { stripeCustomerId: stripeCustomer.id },
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const checkoutSession = await createCheckoutSession(stripe, {
    stripeCustomerId: stripeCustomer.id,
    amountPence: Math.round(params.amount * 100),
    description: params.description,
    successUrl: `${baseUrl}/portal/${customer.portalToken}?paid=1`,
    cancelUrl: `${baseUrl}/portal/${customer.portalToken}`,
    metadata: { customerId: customer.id },
  });

  const paymentUrl = checkoutSession.url!;
  const qrCodeDataUrl = await QRCode.toDataURL(paymentUrl, {
    width: 320,
    margin: 1,
  });

  if (customer.email) {
    await notifyBestEffort("payment link email", () =>
      sendEmail({
        to: customer.email!,
        subject: `Payment request: ${params.description}`,
        html: `
        <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color:#111827;">Payment request</h2>
          <p>Hi ${customer.firstName},</p>
          <p>${params.description} — <strong>£${params.amount.toFixed(2)}</strong></p>
          <a href="${paymentUrl}" style="display:inline-block; background:#6366f1; color:white; padding:12px 20px; border-radius:8px; text-decoration:none; margin-top:12px;">Pay now</a>
        </div>
      `,
      })
    );
  }
  if (customer.phone) {
    await notifyBestEffort("payment link sms", () =>
      sendSms({
        to: customer.phone!,
        body: `Hi ${customer.firstName}, ${params.description} — £${params.amount.toFixed(2)}. Pay securely here: ${paymentUrl}`,
      })
    );
  }

  await prisma.notification.create({
    data: {
      customerId: customer.id,
      type: "INVOICE",
      channel: customer.email ? "EMAIL" : "SMS",
      recipient: customer.email ?? customer.phone ?? "",
      body: paymentUrl,
      status: "sent",
      sentAt: new Date(),
    },
  });

  revalidatePath(`/customers/${customer.id}`);
  return { paymentUrl, qrCodeDataUrl };
}
