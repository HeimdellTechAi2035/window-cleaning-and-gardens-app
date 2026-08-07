import { describe, it, expect } from "vitest";
import { buildInvoiceData, type TransactionForInvoice } from "@/lib/invoice-data";

function makeTransaction(overrides: Partial<TransactionForInvoice> = {}): TransactionForInvoice {
  return {
    id: "txn-1",
    jobId: "job-1",
    customerId: "cust-1",
    amount: 45 as unknown as TransactionForInvoice["amount"], // Prisma.Decimal-like; Number() works on it in the mapper
    currency: "GBP",
    paymentGateway: "GOCARDLESS",
    gatewayTransactionId: null,
    status: "PAID",
    failureReason: null,
    invoiceNumber: "INV-2026-1234",
    invoicePdfUrl: null,
    createdAt: new Date("2026-03-01T10:00:00Z"),
    updatedAt: new Date("2026-03-01T10:00:00Z"),
    customer: {
      id: "cust-1",
      organizationId: "org-1",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: null,
      altPhone: null,
      billingAddressLine1: "1 Test Street",
      billingAddressLine2: null,
      billingCity: "Preston",
      billingPostcode: "PR1 1AA",
      preferredPaymentMethod: "DIRECT_DEBIT",
      gocardlessCustomerId: null,
      gocardlessMandateId: null,
      mandateStatus: null,
      stripeCustomerId: null,
      stripeDefaultPaymentMethodId: null,
      portalToken: "token-1",
      notes: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture doesn't need every Prisma field
    } as any,
    job: {
      id: "job-1",
      organizationId: "org-1",
      roundId: "round-1",
      propertyId: "prop-1",
      serviceId: "service-1",
      assignedWorkerId: null,
      completedByWorkerId: null,
      scheduledDate: new Date(),
      status: "COMPLETED",
      paymentStatus: "PAID",
      priceCharged: 45 as unknown as never,
      isPaid: true,
      completedAt: new Date(),
      skipReason: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      service: {
        id: "service-1",
        organizationId: "org-1",
        title: "Window Clean",
        description: null,
        price: 45 as unknown as never,
        defaultIntervalWeeks: 4,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      property: {
        id: "prop-1",
        customerId: "cust-1",
        addressLine1: "10 Service Road",
        addressLine2: null,
        city: "Preston",
        postcode: "PR1 2BB",
        latitude: null,
        longitude: null,
        accessNotes: null,
        roundId: "round-1",
        roundLocked: false,
        propertyPhotoUrl: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    ...overrides,
  };
}

describe("buildInvoiceData", () => {
  it("maps a paid transaction with a job into full invoice data", () => {
    const invoice = buildInvoiceData(makeTransaction(), "GreenFix Ltd");

    expect(invoice).toEqual({
      invoiceNumber: "INV-2026-1234",
      issuedAt: new Date("2026-03-01T10:00:00Z"),
      status: "PAID",
      currency: "GBP",
      amount: 45,
      organizationName: "GreenFix Ltd",
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      billingAddressLines: ["1 Test Street", "Preston", "PR1 1AA"],
      serviceDescription: "Window Clean",
      serviceAddressLines: ["10 Service Road", "Preston", "PR1 2BB"],
    });
  });

  it("returns null when the transaction has no invoice number", () => {
    const invoice = buildInvoiceData(makeTransaction({ invoiceNumber: null }), "GreenFix Ltd");
    expect(invoice).toBeNull();
  });

  it("falls back to a generic service description and no service address when there is no job", () => {
    const invoice = buildInvoiceData(makeTransaction({ job: null }), "GreenFix Ltd");
    expect(invoice?.serviceDescription).toBe("Service");
    expect(invoice?.serviceAddressLines).toEqual([]);
  });

  it("omits blank/whitespace-only address lines rather than rendering empty rows", () => {
    const invoice = buildInvoiceData(
      makeTransaction({
        customer: {
          ...makeTransaction().customer,
          billingAddressLine1: "  ",
          billingAddressLine2: null,
          billingCity: "Preston",
          billingPostcode: null,
        },
      }),
      "GreenFix Ltd"
    );
    expect(invoice?.billingAddressLines).toEqual(["Preston"]);
  });

  it("handles a customer with no email gracefully", () => {
    const invoice = buildInvoiceData(
      makeTransaction({ customer: { ...makeTransaction().customer, email: null } }),
      "GreenFix Ltd"
    );
    expect(invoice?.customerEmail).toBeNull();
  });
});
