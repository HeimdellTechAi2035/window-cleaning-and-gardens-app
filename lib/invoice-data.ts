import type { Transaction, Customer, Job, Service, Property } from "@prisma/client";

// Shape a route handler needs to query — kept alongside the mapper so the
// `include` passed to Prisma and the type this function expects can never
// drift apart.
export const transactionForInvoiceInclude = {
  customer: true,
  job: { include: { service: true, property: true } },
} as const;

export type TransactionForInvoice = Transaction & {
  customer: Customer;
  job: (Job & { service: Service; property: Property }) | null;
};

export interface InvoiceData {
  invoiceNumber: string;
  issuedAt: Date;
  status: string;
  currency: string;
  amount: number;
  organizationName: string;
  customerName: string;
  customerEmail: string | null;
  billingAddressLines: string[];
  serviceDescription: string;
  serviceAddressLines: string[];
}

function addressLines(...parts: Array<string | null | undefined>): string[] {
  return parts.filter((line): line is string => Boolean(line && line.trim().length > 0));
}

/**
 * Maps a Transaction (with its customer/job/service/property included) to
 * the flat shape the PDF template renders. Returns null for a transaction
 * with no invoiceNumber — Transaction.invoiceNumber is nullable in the
 * schema, and a transaction without one has nothing to put on an invoice,
 * so callers should skip it rather than render a blank/misleading PDF.
 */
export function buildInvoiceData(transaction: TransactionForInvoice, organizationName: string): InvoiceData | null {
  if (!transaction.invoiceNumber) return null;

  return {
    invoiceNumber: transaction.invoiceNumber,
    issuedAt: transaction.createdAt,
    status: transaction.status,
    currency: transaction.currency,
    amount: Number(transaction.amount),
    organizationName,
    customerName: `${transaction.customer.firstName} ${transaction.customer.lastName}`.trim(),
    customerEmail: transaction.customer.email,
    billingAddressLines: addressLines(
      transaction.customer.billingAddressLine1,
      transaction.customer.billingAddressLine2,
      transaction.customer.billingCity,
      transaction.customer.billingPostcode
    ),
    serviceDescription: transaction.job?.service.title ?? "Service",
    serviceAddressLines: transaction.job
      ? addressLines(
          transaction.job.property.addressLine1,
          transaction.job.property.addressLine2,
          transaction.job.property.city,
          transaction.job.property.postcode
        )
      : [],
  };
}
