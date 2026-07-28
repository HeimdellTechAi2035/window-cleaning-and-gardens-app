import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { constructPlatformStripeWebhookEvent, getPlatformStripe } from "@/lib/platform-billing";
import type Stripe from "stripe";

// RoundFlow's own subscription billing webhook — a single, global endpoint
// for Heimdell Tech Ai Ltd's own Stripe account, distinct from the
// per-organization webhooks at /api/webhooks/stripe/[organizationId] which
// belong to each org's own connected Stripe account.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = constructPlatformStripeWebhookEvent(rawBody, signature);
  } catch (err) {
    console.error("Platform Stripe webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "customer.subscription.updated":
    case "customer.subscription.created":
      await syncSubscription(event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const organizationId = session.client_reference_id ?? session.metadata?.organizationId;
  const subscriptionId = session.subscription as string | null;
  const customerId = session.customer as string | null;
  if (!organizationId || !subscriptionId || !customerId) return;

  const stripe = getPlatformStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      platformStripeCustomerId: customerId,
      platformStripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata?.organizationId;
  if (!organizationId) return;

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      platformStripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata?.organizationId;
  if (!organizationId) return;

  await prisma.organization.update({
    where: { id: organizationId },
    data: { subscriptionStatus: "canceled" },
  });
}
