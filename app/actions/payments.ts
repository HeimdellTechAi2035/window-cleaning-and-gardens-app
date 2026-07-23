"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createGoCardlessCustomer, createMandateRedirectFlow } from "@/lib/gocardless";
import { findOrCreateStripeCustomer, getStripe } from "@/lib/stripe";
import { sendEmail, sendSms, mandateInviteEmail } from "@/lib/twilio";

async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  return session;
}

/**
 * Generates a GoCardless Direct Debit mandate signup link and emails/texts
 * it to the customer. The customer completes the mandate on GoCardless's
 * hosted page; the `mandates` webhook then flips mandateStatus to "active".
 */
export async function sendDirectDebitInviteAction(customerId: string) {
  const session = await requireSession();

  const customer = await prisma.customer.findFirstOrThrow({
    where: { id: customerId, organizationId: session.user.organizationId },
  });

  let gocardlessCustomerId = customer.gocardlessCustomerId;
  if (!gocardlessCustomerId) {
    const gcCustomer = await createGoCardlessCustomer({
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

  const flow = await createMandateRedirectFlow({
    customerId: gocardlessCustomerId,
    sessionToken,
    successRedirectUrl: `${baseUrl}/portal/${customer.portalToken}?mandate=complete&session=${sessionToken}`,
    description: "Direct Debit mandate for recurring service payments",
  });

  const mandateUrl = flow.redirect_url!;

  if (customer.email) {
    await sendEmail({
      to: customer.email,
      subject: "Set up your Direct Debit",
      html: mandateInviteEmail({ customerName: customer.firstName, mandateUrl }),
    });
  }
  if (customer.phone) {
    await sendSms({
      to: customer.phone,
      body: `Hi ${customer.firstName}, please set up Direct Debit here: ${mandateUrl}`,
    });
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

/**
 * Creates (or reuses) a Stripe customer and returns a SetupIntent client
 * secret so the dashboard can collect a card on file for future
 * off-session charges triggered by job completion.
 */
export async function createStripeSetupIntentAction(customerId: string) {
  const session = await requireSession();

  const customer = await prisma.customer.findFirstOrThrow({
    where: { id: customerId, organizationId: session.user.organizationId },
  });

  const stripeCustomer = await findOrCreateStripeCustomer({
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

  const stripe = getStripe();
  const setupIntent = await stripe.setupIntents.create({
    customer: stripeCustomer.id,
    payment_method_types: ["card"],
  });

  return { clientSecret: setupIntent.client_secret };
}
