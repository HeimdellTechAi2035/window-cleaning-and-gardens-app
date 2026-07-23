import { prisma } from "@/lib/prisma";
import { createGoCardlessPayment } from "@/lib/gocardless";
import { chargeSavedCard, createCheckoutSession, findOrCreateStripeCustomer } from "@/lib/stripe";
import { sendEmail, sendSms, jobCompletedMessage, paymentReceiptEmail } from "@/lib/twilio";
import { formatCurrency, generateInvoiceNumber } from "@/lib/utils";
import type { Job, Customer, Service, Property } from "@prisma/client";

type JobWithRelations = Job & {
  customer?: Customer;
  service: Service;
  property: Property & { customer: Customer };
};

/**
 * Central automation rule: when a Job is marked COMPLETED, immediately
 * attempt to collect payment via the customer's preferred payment method
 * (GoCardless Direct Debit mandate or Stripe saved card), record the
 * Transaction, and send an SMS/Email receipt. Falls back to leaving the
 * job as UNPAID (e.g. cash / bank transfer customers) so it shows up on
 * the Financials outstanding list.
 */
export async function triggerPostJobPayment(job: JobWithRelations) {
  const customer = job.property.customer;
  const amount = Number(job.priceCharged);
  const amountPence = Math.round(amount * 100);

  if (customer.preferredPaymentMethod === "DIRECT_DEBIT" && customer.gocardlessMandateId) {
    try {
      const payment = await createGoCardlessPayment({
        mandateId: customer.gocardlessMandateId,
        amountPence,
        description: job.service.title,
        metadata: { jobId: job.id, customerId: customer.id },
      });

      const invoiceNumber = generateInvoiceNumber();
      await prisma.transaction.create({
        data: {
          jobId: job.id,
          customerId: customer.id,
          amount,
          paymentGateway: "GOCARDLESS",
          gatewayTransactionId: payment.id,
          status: "PENDING_DIRECT_DEBIT",
          invoiceNumber,
        },
      });

      await prisma.job.update({
        where: { id: job.id },
        data: { paymentStatus: "PENDING_DIRECT_DEBIT" },
      });

      await notifyJobCompleted(job, customer, amount, invoiceNumber);
      return { gateway: "GOCARDLESS" as const, status: "PENDING_DIRECT_DEBIT" as const };
    } catch (err) {
      await prisma.job.update({ where: { id: job.id }, data: { paymentStatus: "FAILED" } });
      throw err;
    }
  }

  if (customer.preferredPaymentMethod === "CARD" && customer.stripeCustomerId) {
    try {
      let paymentMethodId = customer.stripeDefaultPaymentMethodId;

      if (paymentMethodId) {
        const intent = await chargeSavedCard({
          stripeCustomerId: customer.stripeCustomerId,
          paymentMethodId,
          amountPence,
          description: job.service.title,
          metadata: { jobId: job.id, customerId: customer.id },
        });

        const invoiceNumber = generateInvoiceNumber();
        const paid = intent.status === "succeeded";
        await prisma.transaction.create({
          data: {
            jobId: job.id,
            customerId: customer.id,
            amount,
            paymentGateway: "STRIPE",
            gatewayTransactionId: intent.id,
            status: paid ? "PAID" : "PENDING_DIRECT_DEBIT",
            invoiceNumber,
          },
        });

        await prisma.job.update({
          where: { id: job.id },
          data: { paymentStatus: paid ? "PAID" : "PENDING_DIRECT_DEBIT", isPaid: paid },
        });

        if (paid) await notifyPaymentReceived(customer, job.service.title, amount, invoiceNumber);
        else await notifyJobCompleted(job, customer, amount, invoiceNumber);

        return { gateway: "STRIPE" as const, status: paid ? ("PAID" as const) : ("PENDING_DIRECT_DEBIT" as const) };
      }

      // No saved card yet — send a Stripe Checkout payment link instead.
      const stripeCustomer = await findOrCreateStripeCustomer({
        existingStripeCustomerId: customer.stripeCustomerId,
        email: customer.email,
        name: `${customer.firstName} ${customer.lastName}`,
        phone: customer.phone,
      });

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const session = await createCheckoutSession({
        stripeCustomerId: stripeCustomer.id,
        amountPence,
        description: job.service.title,
        successUrl: `${baseUrl}/portal/${customer.portalToken}?paid=1`,
        cancelUrl: `${baseUrl}/portal/${customer.portalToken}`,
        metadata: { jobId: job.id, customerId: customer.id },
      });

      await prisma.job.update({ where: { id: job.id }, data: { paymentStatus: "UNPAID" } });
      if (customer.phone) {
        await sendSms({
          to: customer.phone,
          body: `Hi ${customer.firstName}, your ${job.service.title} is complete. Pay securely here: ${session.url}`,
        });
      }
      return { gateway: "STRIPE" as const, status: "UNPAID" as const, checkoutUrl: session.url };
    } catch (err) {
      await prisma.job.update({ where: { id: job.id }, data: { paymentStatus: "FAILED" } });
      throw err;
    }
  }

  // Cash / bank transfer — leave unpaid for manual reconciliation, still notify.
  await notifyJobCompleted(job, customer, amount, null);
  return { gateway: "MANUAL_CASH" as const, status: "UNPAID" as const };
}

async function notifyJobCompleted(
  job: JobWithRelations,
  customer: Customer,
  amount: number,
  invoiceNumber: string | null
) {
  const message = jobCompletedMessage(customer.firstName, job.service.title, formatCurrency(amount));

  if (customer.phone) {
    const sms = await sendSms({ to: customer.phone, body: message });
    await prisma.notification.create({
      data: {
        customerId: customer.id,
        jobId: job.id,
        type: "JOB_COMPLETED",
        channel: "SMS",
        recipient: customer.phone,
        body: message,
        status: "sent",
        providerMessageId: sms.sid,
        sentAt: new Date(),
      },
    });
  }

  if (customer.email && invoiceNumber) {
    const html = paymentReceiptEmail({
      customerName: customer.firstName,
      serviceTitle: job.service.title,
      amount: formatCurrency(amount),
      invoiceNumber,
    });
    await sendEmail({ to: customer.email, subject: `Invoice ${invoiceNumber}`, html });
    await prisma.notification.create({
      data: {
        customerId: customer.id,
        jobId: job.id,
        type: "INVOICE",
        channel: "EMAIL",
        recipient: customer.email,
        subject: `Invoice ${invoiceNumber}`,
        body: html,
        status: "sent",
        sentAt: new Date(),
      },
    });
  }
}

async function notifyPaymentReceived(
  customer: Customer,
  serviceTitle: string,
  amount: number,
  invoiceNumber: string
) {
  if (!customer.email) return;
  const html = paymentReceiptEmail({
    customerName: customer.firstName,
    serviceTitle,
    amount: formatCurrency(amount),
    invoiceNumber,
  });
  await sendEmail({ to: customer.email, subject: `Payment received — ${invoiceNumber}`, html });
  await prisma.notification.create({
    data: {
      customerId: customer.id,
      type: "PAYMENT_RECEIPT",
      channel: "EMAIL",
      recipient: customer.email,
      subject: `Payment received — ${invoiceNumber}`,
      body: html,
      status: "sent",
      sentAt: new Date(),
    },
  });
}
