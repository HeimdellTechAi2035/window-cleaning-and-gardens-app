import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { constructStripeWebhookEvent } from "@/lib/stripe";
import { sendEmail, paymentReceiptEmail } from "@/lib/twilio";
import { formatCurrency, generateInvoiceNumber } from "@/lib/utils";
import type Stripe from "stripe";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = constructStripeWebhookEvent(rawBody, signature);
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
      break;
    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
      break;
    case "setup_intent.succeeded":
      await handleSetupIntentSucceeded(event.data.object as Stripe.SetupIntent);
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const jobId = session.metadata?.jobId;
  const jobIds = session.metadata?.jobIds?.split(",").filter(Boolean) ?? [];
  const customerId = session.metadata?.customerId;
  if (!customerId) return;

  const invoiceNumber = generateInvoiceNumber();
  const amount = (session.amount_total ?? 0) / 100;

  await prisma.transaction.create({
    data: {
      jobId: jobId ?? undefined,
      customerId,
      amount,
      paymentGateway: "STRIPE",
      gatewayTransactionId: session.payment_intent as string,
      status: "PAID",
      invoiceNumber,
    },
  });

  const allJobIds = jobId ? [jobId] : jobIds;
  if (allJobIds.length > 0) {
    await prisma.job.updateMany({
      where: { id: { in: allJobIds } },
      data: { isPaid: true, paymentStatus: "PAID" },
    });
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (customer?.email) {
    await sendEmail({
      to: customer.email,
      subject: `Payment received — ${invoiceNumber}`,
      html: paymentReceiptEmail({
        customerName: customer.firstName,
        serviceTitle: "your recent visit",
        amount: formatCurrency(amount),
        invoiceNumber,
      }),
    });
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const jobId = paymentIntent.metadata?.jobId;
  if (!jobId) return;

  await prisma.job.update({
    where: { id: jobId },
    data: { isPaid: true, paymentStatus: "PAID" },
  });
  await prisma.transaction.updateMany({
    where: { gatewayTransactionId: paymentIntent.id },
    data: { status: "PAID" },
  });
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  const jobId = paymentIntent.metadata?.jobId;
  if (!jobId) return;

  await prisma.job.update({
    where: { id: jobId },
    data: { paymentStatus: "FAILED" },
  });
  await prisma.transaction.updateMany({
    where: { gatewayTransactionId: paymentIntent.id },
    data: { status: "FAILED", failureReason: paymentIntent.last_payment_error?.message },
  });
}

async function handleSetupIntentSucceeded(setupIntent: Stripe.SetupIntent) {
  const customerId = setupIntent.customer as string | null;
  const paymentMethodId = setupIntent.payment_method as string | null;
  if (!customerId || !paymentMethodId) return;

  const customer = await prisma.customer.findFirst({ where: { stripeCustomerId: customerId } });
  if (!customer) return;

  await prisma.customer.update({
    where: { id: customer.id },
    data: { stripeDefaultPaymentMethodId: paymentMethodId, preferredPaymentMethod: "CARD" },
  });
}
