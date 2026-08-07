import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildInvoiceData, transactionForInvoiceInclude } from "@/lib/invoice-data";
import { renderInvoicesPdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";

// Single-invoice PDF, opened by clicking an invoice number on /financials.
// `inline` disposition so it opens directly in the browser's PDF viewer
// (which has its own download/save/print controls) rather than forcing an
// immediate file save.
export async function GET(request: Request, { params }: { params: Promise<{ transactionId: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { transactionId } = await params;

  // Scoped by organizationId in the query itself (not checked after the
  // fact) — a transaction belonging to another organization simply doesn't
  // match and comes back null, same tenant-isolation pattern used
  // throughout this app's other routes/actions.
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, customer: { organizationId: session.user.organizationId } },
    include: transactionForInvoiceInclude,
  });
  if (!transaction) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { name: true },
  });

  const invoice = buildInvoiceData(transaction, organization?.name ?? "");
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not available" }, { status: 404 });
  }

  const pdfBuffer = await renderInvoicesPdf([invoice]);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
