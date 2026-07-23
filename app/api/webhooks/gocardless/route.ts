import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseGoCardlessWebhook, type GoCardlessWebhookEvent } from "@/lib/gocardless";
import { sendEmail, paymentReceiptEmail } from "@/lib/twilio";
import { formatCurrency, generateInvoiceNumber } from "@/lib/utils";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("Webhook-Signature");

  let events: GoCardlessWebhookEvent[];
  try {
    events = parseGoCardlessWebhook(rawBody, signature);
  } catch (err) {
    console.error("GoCardless webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  for (const event of events) {
    try {
      await handleEvent(event);
    } catch (err) {
      console.error("Failed to process GoCardless event", event.id, err);
    }
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(event: GoCardlessWebhookEvent) {
  switch (event.resource_type) {
    case "payments":
      return handlePaymentEvent(event);
    case "mandates":
      return handleMandateEvent(event);
    default:
      return;
  }
}

async function handlePaymentEvent(event: GoCardlessWebhookEvent) {
  const paymentId = event.links?.payment;
  if (!paymentId) return;

  const transaction = await prisma.transaction.findFirst({
    where: { gatewayTransactionId: paymentId },
    include: { job: true, customer: true },
  });
  if (!transaction) return;

  switch (event.action) {
    case "confirmed":
    case "paid_out": {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: "PAID", invoiceNumber: transaction.invoiceNumber ?? generateInvoiceNumber() },
      });
      if (transaction.jobId) {
        await prisma.job.update({
          where: { id: transaction.jobId },
          data: { isPaid: true, paymentStatus: "PAID" },
        });
      }
      if (transaction.customer.email) {
        const invoiceNumber = transaction.invoiceNumber ?? generateInvoiceNumber();
        await sendEmail({
          to: transaction.customer.email,
          subject: `Payment received — ${invoiceNumber}`,
          html: paymentReceiptEmail({
            customerName: transaction.customer.firstName,
            serviceTitle: "your recent visit",
            amount: formatCurrency(Number(transaction.amount)),
            invoiceNumber,
          }),
        });
      }
      break;
    }
    case "failed":
    case "charged_back":
    case "cancelled": {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: "FAILED", failureReason: event.details?.description ?? event.action },
      });
      if (transaction.jobId) {
        await prisma.job.update({
          where: { id: transaction.jobId },
          data: { paymentStatus: "FAILED" },
        });
      }
      break;
    }
    default:
      break;
  }
}

async function handleMandateEvent(event: GoCardlessWebhookEvent) {
  const mandateId = event.links?.mandate;
  if (!mandateId) return;

  const customer = await prisma.customer.findFirst({
    where: { gocardlessMandateId: mandateId },
  });
  if (!customer) return;

  switch (event.action) {
    case "active":
      await prisma.customer.update({
        where: { id: customer.id },
        data: { mandateStatus: "active", preferredPaymentMethod: "DIRECT_DEBIT" },
      });
      break;
    case "failed":
    case "cancelled":
    case "expired":
      await prisma.customer.update({
        where: { id: customer.id },
        data: { mandateStatus: event.action },
      });
      break;
    default:
      await prisma.customer.update({
        where: { id: customer.id },
        data: { mandateStatus: event.action },
      });
  }
}
