import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "@/components/planner/job-status-badge";
import {
  Banknote,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const today = new Date();

  const [monthRevenueAgg, outstandingAgg, pendingDirectDebitAgg, completedTodayCount, todaysJobs] =
    await Promise.all([
      prisma.transaction.aggregate({
        where: {
          customer: { organizationId },
          status: "PAID",
          createdAt: { gte: new Date(today.getFullYear(), today.getMonth(), 1) },
        },
        _sum: { amount: true },
      }),
      prisma.job.aggregate({
        where: { organizationId, paymentStatus: { in: ["UNPAID", "FAILED"] }, status: "COMPLETED" },
        _sum: { priceCharged: true },
        _count: true,
      }),
      prisma.job.aggregate({
        where: { organizationId, paymentStatus: "PENDING_DIRECT_DEBIT" },
        _sum: { priceCharged: true },
        _count: true,
      }),
      prisma.job.count({
        where: {
          organizationId,
          status: "COMPLETED",
          scheduledDate: { gte: startOfDay(today), lte: endOfDay(today) },
        },
      }),
      prisma.job.findMany({
        where: {
          organizationId,
          scheduledDate: { gte: startOfDay(today), lte: endOfDay(today) },
        },
        include: { service: true, property: { include: { customer: true } } },
        orderBy: [{ sequenceOrder: "asc" }],
        take: 6,
      }),
    ]);

  const stats = [
    {
      label: "Revenue this month",
      value: formatCurrency(Number(monthRevenueAgg._sum.amount ?? 0)),
      icon: Banknote,
      accent: "text-success",
    },
    {
      label: "Outstanding invoices",
      value: formatCurrency(Number(outstandingAgg._sum.priceCharged ?? 0)),
      sub: `${outstandingAgg._count} job${outstandingAgg._count === 1 ? "" : "s"}`,
      icon: AlertCircle,
      accent: "text-destructive",
    },
    {
      label: "Pending Direct Debits",
      value: formatCurrency(Number(pendingDirectDebitAgg._sum.priceCharged ?? 0)),
      sub: `${pendingDirectDebitAgg._count} in progress`,
      icon: Clock,
      accent: "text-warning",
    },
    {
      label: "Completed today",
      value: String(completedTodayCount),
      icon: CheckCircle2,
      accent: "text-primary",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
                {stat.sub && <p className="mt-0.5 text-xs text-muted-foreground">{stat.sub}</p>}
              </div>
              <stat.icon className={`h-8 w-8 ${stat.accent}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Today&apos;s round</CardTitle>
          <Link href="/planner">
            <Button variant="ghost" size="sm">
              Open Day Pilot
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {todaysJobs.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No jobs scheduled today.
            </p>
          )}
          {todaysJobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{job.service.title}</p>
                <p className="text-xs text-muted-foreground">
                  {job.property.customer.firstName} {job.property.customer.lastName} · {job.property.city}
                </p>
              </div>
              <JobStatusBadge status={job.status} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
