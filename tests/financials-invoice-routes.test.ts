import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: { findFirst: vi.fn(), findMany: vi.fn() },
    organization: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const renderInvoicesPdfMock = vi.fn(async (_invoices: unknown[]) => Buffer.from("%PDF-fake"));
vi.mock("@/lib/invoice-pdf", () => ({
  renderInvoicesPdf: (invoices: unknown[]) => renderInvoicesPdfMock(invoices),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET as getSingleInvoice } from "@/app/api/financials/invoices/[transactionId]/route";
import { GET as getAllInvoices } from "@/app/api/financials/invoices/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma's generated types are impractical to hand-mock; these tests cover route logic, not Prisma's type surface.
const db = prisma as any;
// NextAuth's `auth` export is overloaded (plain session getter vs. middleware
// wrapper) which confuses vi.mocked()'s overload resolution — same cast
// pattern already used in tests/account-deletion-actions.test.ts.
const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

const SESSION = { user: { organizationId: "org-1" } };

function baseTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "txn-1",
    invoiceNumber: "INV-2026-1234",
    currency: "GBP",
    amount: 45,
    status: "PAID",
    createdAt: new Date("2026-03-01T10:00:00Z"),
    customer: {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      billingAddressLine1: null,
      billingAddressLine2: null,
      billingCity: null,
      billingPostcode: null,
    },
    job: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/financials/invoices/[transactionId] — single invoice PDF", () => {
  function call(transactionId: string) {
    return getSingleInvoice(new Request(`https://example.invalid/api/financials/invoices/${transactionId}`), {
      params: Promise.resolve({ transactionId }),
    });
  }

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    const response = await call("txn-1");
    expect(response.status).toBe(401);
    expect(db.transaction.findFirst).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the caller's own organization", async () => {
    mockAuth.mockResolvedValue(SESSION);
    db.transaction.findFirst.mockResolvedValue(baseTransaction());
    db.organization.findUnique.mockResolvedValue({ name: "GreenFix Ltd" });

    await call("txn-1");

    expect(db.transaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "txn-1", customer: { organizationId: "org-1" } },
      })
    );
  });

  it("returns 404 for a transaction belonging to a different organization (never leaks a 200 with someone else's invoice)", async () => {
    mockAuth.mockResolvedValue(SESSION);
    db.transaction.findFirst.mockResolvedValue(null); // the where-clause scoping means a foreign-org id simply doesn't match

    const response = await call("someone-elses-txn");
    expect(response.status).toBe(404);
    expect(renderInvoicesPdfMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the transaction has no invoice number", async () => {
    mockAuth.mockResolvedValue(SESSION);
    db.transaction.findFirst.mockResolvedValue(baseTransaction({ invoiceNumber: null }));
    db.organization.findUnique.mockResolvedValue({ name: "GreenFix Ltd" });

    const response = await call("txn-1");
    expect(response.status).toBe(404);
  });

  it("returns a PDF with inline disposition and the invoice number as filename", async () => {
    mockAuth.mockResolvedValue(SESSION);
    db.transaction.findFirst.mockResolvedValue(baseTransaction());
    db.organization.findUnique.mockResolvedValue({ name: "GreenFix Ltd" });

    const response = await call("txn-1");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('inline; filename="INV-2026-1234.pdf"');
    expect(renderInvoicesPdfMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/financials/invoices — bulk/master PDF", () => {
  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    const response = await getAllInvoices();
    expect(response.status).toBe(401);
    expect(db.transaction.findMany).not.toHaveBeenCalled();
  });

  it("only queries this organization's transactions with a non-null invoice number", async () => {
    mockAuth.mockResolvedValue(SESSION);
    db.transaction.findMany.mockResolvedValue([baseTransaction()]);
    db.organization.findUnique.mockResolvedValue({ name: "GreenFix Ltd" });

    await getAllInvoices();

    expect(db.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customer: { organizationId: "org-1" }, invoiceNumber: { not: null } },
      })
    );
  });

  it("returns 404 when there is nothing to download", async () => {
    mockAuth.mockResolvedValue(SESSION);
    db.transaction.findMany.mockResolvedValue([]);
    db.organization.findUnique.mockResolvedValue({ name: "GreenFix Ltd" });

    const response = await getAllInvoices();
    expect(response.status).toBe(404);
    expect(renderInvoicesPdfMock).not.toHaveBeenCalled();
  });

  it("renders every matching transaction and returns an attachment", async () => {
    mockAuth.mockResolvedValue(SESSION);
    db.transaction.findMany.mockResolvedValue([
      baseTransaction({ id: "txn-1", invoiceNumber: "INV-2026-0001" }),
      baseTransaction({ id: "txn-2", invoiceNumber: "INV-2026-0002" }),
    ]);
    db.organization.findUnique.mockResolvedValue({ name: "GreenFix Ltd" });

    const response = await getAllInvoices();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="/);
    expect(renderInvoicesPdfMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ invoiceNumber: "INV-2026-0001" }),
        expect.objectContaining({ invoiceNumber: "INV-2026-0002" }),
      ])
    );
  });

  it("skips any transaction that (defensively) has no invoice number rather than crashing", async () => {
    mockAuth.mockResolvedValue(SESSION);
    db.transaction.findMany.mockResolvedValue([
      baseTransaction({ id: "txn-1", invoiceNumber: "INV-2026-0001" }),
      baseTransaction({ id: "txn-2", invoiceNumber: null }),
    ]);
    db.organization.findUnique.mockResolvedValue({ name: "GreenFix Ltd" });

    await getAllInvoices();

    const rendered = renderInvoicesPdfMock.mock.calls[0][0] as Array<{ invoiceNumber: string }>;
    expect(rendered).toHaveLength(1);
    expect(rendered[0].invoiceNumber).toBe("INV-2026-0001");
  });
});
