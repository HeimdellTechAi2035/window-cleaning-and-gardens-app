import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Banknote, AlertCircle, Clock, CheckCircle2 } from "lucide-react";

const gatewayLabel: Record<string, string> = {
  GOCARDLESS: "GoCardless",
  STRIPE: "Stripe",
  MANUAL_CASH: "Cash / Manual",
};

const statusVariant: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  PAID: "success",
  PENDING_DIRECT_DEBIT: "warning",
  FAILED: "destructive",
  UNPAID: "secondary",
};

export default async function FinancialsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [weekRevenue, monthRevenue, outstanding, pendingDD, completedJobs, transactions] =
    await Promise.all([
      prisma.transaction.aggregate({
        where: { customer: { organizationId }, status: "PAID", createdAt: { gte: weekAgo } },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { customer: { organizationId }, status: "PAID", createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      prisma.job.aggregate({
        where: { organizationId, status: "COMPLETED", paymentStatus: { in: ["UNPAID", "FAILED"] } },
        _sum: { priceCharged: true },
        _count: true,
      }),
      prisma.job.aggregate({
        where: { organizationId, paymentStatus: "PENDING_DIRECT_DEBIT" },
        _sum: { priceCharged: true },
        _count: true,
      }),
      prisma.job.count({ where: { organizationId, status: "COMPLETED" } }),
      prisma.transaction.findMany({
        where: { customer: { organizationId } },
        include: { customer: true, job: { include: { service: true } } },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
    ]);

  const stats = [
    { label: "Revenue (7 days)", value: formatCurrency(Number(weekRevenue._sum.amount ?? 0)), icon: Banknote, accent: "text-success" },
    { label: "Revenue (this month)", value: formatCurrency(Number(monthRevenue._sum.amount ?? 0)), icon: Banknote, accent: "text-success" },
    { label: "Outstanding invoices", value: formatCurrency(Number(outstanding._sum.priceCharged ?? 0)), sub: `${outstanding._count} jobs`, icon: AlertCircle, accent: "text-destructive" },
    { label: "Pending Direct Debits", value: formatCurrency(Number(pendingDD._sum.priceCharged ?? 0)), sub: `${pendingDD._count} in progress`, icon: Clock, accent: "text-warning" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-2xl font-semibold">{s.value}</p>
                {s.sub && <p className="mt-0.5 text-xs text-muted-foreground">{s.sub}</p>}
              </div>
              <s.icon className={`h-8 w-8 ${s.accent}`} />
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Completed jobs (all time)</p>
              <p className="mt-1 text-2xl font-semibold">{completedJobs}</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="pb-2 pr-4">Invoice</th>
                <th className="pb-2 pr-4">Customer</th>
                <th className="pb-2 pr-4">Service</th>
                <th className="pb-2 pr-4">Gateway</th>
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4 text-right">Amount</th>
                <th className="pb-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-border/60">
                  <td className="py-2.5 pr-4 font-medium">{t.invoiceNumber ?? "—"}</td>
                  <td className="py-2.5 pr-4">
                    {t.customer.firstName} {t.customer.lastName}
                  </td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{t.job?.service.title ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{gatewayLabel[t.paymentGateway]}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{formatDate(t.createdAt)}</td>
                  <td className="py-2.5 pr-4 text-right font-medium">{formatCurrency(Number(t.amount))}</td>
                  <td className="py-2.5 text-right">
                    <Badge variant={statusVariant[t.status] ?? "secondary"}>{t.status.replace(/_/g, " ")}</Badge>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No transactions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
