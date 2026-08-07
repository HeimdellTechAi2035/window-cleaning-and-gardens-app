import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildInvoiceData, transactionForInvoiceInclude, type InvoiceData } from "@/lib/invoice-data";
import { renderInvoicesPdf } from "@/lib/invoice-pdf";
import { formatDate } from "@/lib/utils";

export const runtime = "nodejs";

// Every one of this organization's invoices, combined into a single PDF
// (one page per invoice, oldest first) for handing to an accountant or
// HMRC — the "Download all" button on /financials. `attachment`
// disposition so it saves straight to disk rather than opening a viewer
// tab, since that's the point of a bulk export.
//
// Capped at MAX_INVOICES so a very large organization's history can't turn
// this into an unbounded render inside a serverless function.
const MAX_INVOICES = 1000;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;

  const [transactions, organization] = await Promise.all([
    prisma.transaction.findMany({
      where: { customer: { organizationId }, invoiceNumber: { not: null } },
      include: transactionForInvoiceInclude,
      orderBy: { createdAt: "asc" },
      take: MAX_INVOICES,
    }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ]);

  const organizationName = organization?.name ?? "";
  const invoices = transactions
    .map((t) => buildInvoiceData(t, organizationName))
    .filter((invoice): invoice is InvoiceData => invoice !== null);

  if (invoices.length === 0) {
    return NextResponse.json({ error: "No invoices to download yet" }, { status: 404 });
  }

  const pdfBuffer = await renderInvoicesPdf(invoices);
  const filename = `invoices-${organizationName || "roundflow"}-${formatDate(new Date(), { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")}.pdf`
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-");

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
