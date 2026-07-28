"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSubscriptionCheckoutSession, createBillingPortalSession } from "@/lib/platform-billing";

async function requireAdminSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  if (session.user.role !== "ADMIN") throw new Error("Admin access required");
  return session;
}

// Thrown Errors from Server Actions don't reliably reach the client in
// production when the action's POST target needs re-rendering — so
// failures are returned as a typed result instead of thrown.
export async function startSubscriptionCheckoutAction(): Promise<
  { checkoutUrl: string } | { error: string }
> {
  try {
    const session = await requireAdminSession();
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: session.user.organizationId },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const checkoutSession = await createSubscriptionCheckoutSession({
      organizationId: org.id,
      existingStripeCustomerId: org.platformStripeCustomerId,
      customerEmail: session.user.email ?? "",
      successUrl: `${baseUrl}/billing/success`,
      cancelUrl: `${baseUrl}/billing/subscribe`,
    });

    if (!checkoutSession.url) throw new Error("Stripe did not return a checkout URL");
    return { checkoutUrl: checkoutSession.url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to start checkout" };
  }
}

export async function openBillingPortalAction(): Promise<{ portalUrl: string } | { error: string }> {
  try {
    const session = await requireAdminSession();
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: session.user.organizationId },
    });

    if (!org.platformStripeCustomerId) {
      return { error: "No subscription found yet — start your subscription first." };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const portalSession = await createBillingPortalSession({
      stripeCustomerId: org.platformStripeCustomerId,
      returnUrl: `${baseUrl}/settings`,
    });

    return { portalUrl: portalSession.url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to open billing portal" };
  }
}
