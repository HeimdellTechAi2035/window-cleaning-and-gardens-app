import { describe, it, expect, vi } from "vitest";
import { renderInvoicesPdf } from "@/lib/invoice-pdf";
import type { InvoiceData } from "@/lib/invoice-data";

// Real @react-pdf/renderer rendering (not mocked) — this is the one file in
// this project that exercises the actual PDF layout engine end to end, the
// same way tests/reviewer-access-actions.test.ts exercises real bcrypt
// rather than mocking it away. Rendering is slower than a pure-logic test,
// so the timeout is raised, matching that file's precedent.
vi.setConfig({ testTimeout: 20000 });

function makeInvoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
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
    ...overrides,
  };
}

describe("renderInvoicesPdf", () => {
  it("renders a single invoice into a real PDF buffer", async () => {
    const buffer = await renderInvoicesPdf([makeInvoice()]);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("renders every invoice's page count into a larger buffer than a single invoice", async () => {
    const single = await renderInvoicesPdf([makeInvoice()]);
    const many = await renderInvoicesPdf([
      makeInvoice({ invoiceNumber: "INV-2026-0001" }),
      makeInvoice({ invoiceNumber: "INV-2026-0002" }),
      makeInvoice({ invoiceNumber: "INV-2026-0003" }),
    ]);

    expect(many.length).toBeGreaterThan(single.length);
  });

  it("handles an invoice with no service address and no email without throwing", async () => {
    const buffer = await renderInvoicesPdf([
      makeInvoice({ serviceAddressLines: [], customerEmail: null }),
    ]);
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("renders an empty invoice list to a valid (near-empty) PDF rather than throwing", async () => {
    const buffer = await renderInvoicesPdf([]);
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
