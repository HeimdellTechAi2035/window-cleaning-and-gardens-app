import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JobStatusBadge } from "@/components/planner/job-status-badge";
import { StripePaymentButton } from "@/components/payments/stripe-payment-button";
import { PortalAccessForm } from "@/components/payments/portal-access-form";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Droplets, MapPin, CalendarCheck } from "lucide-react";

export default async function ClientPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { token } = await params;
  const { paid } = await searchParams;

  const customer = await prisma.customer.findUnique({
    where: { portalToken: token },
    include: {
      properties: true,
      organization: { select: { name: true } },
    },
  });

  if (!customer) notFound();

  const [upcomingJobs, historyJobs, transactions] = await Promise.all([
    prisma.job.findMany({
      where: { property: { customerId: customer.id }, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      include: { service: true, property: true },
      orderBy: { scheduledDate: "asc" },
      take: 5,
    }),
    prisma.job.findMany({
      where: { property: { customerId: customer.id }, status: "COMPLETED" },
      include: { service: true, property: true },
      orderBy: { completedAt: "desc" },
      take: 10,
    }),
    prisma.transaction.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const outstandingAmount = historyJobs
    .filter((j) => j.paymentStatus === "UNPAID" || j.paymentStatus === "FAILED")
    .reduce((sum, j) => sum + Number(j.priceCharged), 0);

  return (
    <div className="min-h-screen bg-muted/30 pb-16">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Droplets className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">{customer.organization.name}</p>
            <p className="text-xs text-muted-foreground">Client portal</p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
        {paid === "1" && (
          <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
            Payment received — thank you!
          </div>
        )}

        <div>
          <h1 className="text-xl font-semibold">Hi {customer.firstName},</h1>
          <p className="text-sm text-muted-foreground">Here&apos;s everything about your service.</p>
        </div>

        {outstandingAmount > 0 && (
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Outstanding balance</p>
                <p className="text-xl font-semibold">{formatCurrency(outstandingAmount)}</p>
              </div>
              <StripePaymentButton token={token} amount={outstandingAmount} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="h-4 w-4" />
              Upcoming visits
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {upcomingJobs.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No upcoming visits scheduled.</p>
            )}
            {upcomingJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5 text-sm">
                <div>
                  <p className="font-medium">{job.service.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(job.scheduledDate)}</p>
                </div>
                <JobStatusBadge status={job.status} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Visit history & photos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {historyJobs.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No completed visits yet.</p>
            )}
            {historyJobs.map((job) => (
              <div key={job.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between text-sm">
                  <p className="font-medium">{job.service.title}</p>
                  <span className="text-muted-foreground">
                    {job.completedAt ? formatDate(job.completedAt) : "—"}
                  </span>
                </div>
                {job.afterPhotoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={job.afterPhotoUrl}
                    alt="Completed visit"
                    className="h-40 w-full rounded-md object-cover"
                  />
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatCurrency(Number(job.priceCharged))}</span>
                  <Badge variant={job.paymentStatus === "PAID" ? "success" : "secondary"}>
                    {job.paymentStatus.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" />
              Property access instructions
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {customer.properties.map((property) => (
              <div key={property.id} className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  {property.addressLine1}, {property.city} {property.postcode}
                </p>
                <PortalAccessForm
                  token={token}
                  propertyId={property.id}
                  initialNotes={property.accessNotes ?? ""}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoices</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {transactions.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No invoices yet.</p>
            )}
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5 text-sm">
                <span>{t.invoiceNumber ?? "Invoice"}</span>
                <div className="flex items-center gap-3">
                  <span>{formatCurrency(Number(t.amount))}</span>
                  <Badge variant={t.status === "PAID" ? "success" : "secondary"}>{t.status.replace(/_/g, " ")}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
