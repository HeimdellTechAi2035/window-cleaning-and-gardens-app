"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createCheckoutSession, findOrCreateStripeCustomer, getStripeClient } from "@/lib/stripe";

async function requireCustomerByToken(token: string) {
  const customer = await prisma.customer.findUnique({ where: { portalToken: token } });
  if (!customer) throw new Error("Invalid portal link");
  return customer;
}

export async function updateAccessNotesFromPortalAction(params: {
  token: string;
  propertyId: string;
  accessNotes: string;
}) {
  const customer = await requireCustomerByToken(params.token);

  const property = await prisma.property.findFirstOrThrow({
    where: { id: params.propertyId, customerId: customer.id },
  });

  await prisma.property.update({
    where: { id: property.id },
    data: { accessNotes: params.accessNotes },
  });

  revalidatePath(`/portal/${params.token}`);
}

// Thrown Errors from Server Actions don't reliably reach the client in
// production when the action's POST target needs re-rendering — so
// failures are returned as a typed result instead of thrown.
export async function payOutstandingBalanceAction(
  token: string
): Promise<{ checkoutUrl: string | null } | { error: string }> {
  try {
    return await payOutstandingBalanceActionInner(token);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Payment failed" };
  }
}

async function payOutstandingBalanceActionInner(token: string) {
  const customer = await requireCustomerByToken(token);

  const unpaidJobs = await prisma.job.findMany({
    where: {
      property: { customerId: customer.id },
      status: "COMPLETED",
      paymentStatus: { in: ["UNPAID", "FAILED"] },
    },
    include: { service: true },
  });

  if (unpaidJobs.length === 0) {
    throw new Error("No outstanding balance");
  }

  const totalAmount = unpaidJobs.reduce((sum, j) => sum + Number(j.priceCharged), 0);

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: customer.organizationId },
  });
  if (!organization.stripeSecretKey) {
    throw new Error("This business hasn't set up online payments yet — please contact them directly.");
  }
  const stripe = getStripeClient(organization.stripeSecretKey);

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
  const session = await createCheckoutSession(stripe, {
    stripeCustomerId: stripeCustomer.id,
    amountPence: Math.round(totalAmount * 100),
    description: `Outstanding balance (${unpaidJobs.length} visit${unpaidJobs.length === 1 ? "" : "s"})`,
    successUrl: `${baseUrl}/portal/${token}?paid=1`,
    cancelUrl: `${baseUrl}/portal/${token}`,
    metadata: { customerId: customer.id, jobIds: unpaidJobs.map((j) => j.id).join(",") },
  });

  return { checkoutUrl: session.url };
}
