import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JobStatusBadge } from "@/components/planner/job-status-badge";
import { StripePaymentButton } from "@/components/payments/stripe-payment-button";
import { PortalAccessForm } from "@/components/payments/portal-access-form";
import { LegalFooter } from "@/components/layout/legal-footer";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Droplets, MapPin, CalendarCheck, Leaf, CheckCircle, Clock } from "lucide-react";

export default async function ClientPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string; subscribed?: string }>;
}) {
  const { token } = await params;
  const { paid, subscribed } = await searchParams;

  const customer = await prisma.customer.findUnique({
    where: { portalToken: token },
    include: {
      properties: true,
      organization: { select: { name: true } },
      gardenSubscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!customer) notFound();

  const gardenSub = customer.gardenSubscriptions[0] ?? null;

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

        {subscribed === "1" && (
          <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success flex items-start gap-2">
            <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              <strong>You&apos;re signed up!</strong> Your Direct Debit mandate is being set up. We&apos;ll call you shortly to confirm your subscription — please keep an eye out for a call from us.
            </span>
          </div>
        )}

        <div>
          <h1 className="text-xl font-semibold">Hi {customer.firstName},</h1>
          <p className="text-sm text-muted-foreground">Here&apos;s everything about your service.</p>
        </div>

        {/* Garden subscription card */}
        {gardenSub && (
          <Card className={gardenSub.status === "ACTIVE" ? "border-success/40" : "border-primary/30"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Leaf className="h-4 w-4 text-primary" />
                Garden Maintenance Subscription
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {gardenSub.plan === "LAWN" && "Lawn Package"}
                    {gardenSub.plan === "SILVER" && "Silver Package"}
                    {gardenSub.plan === "GOLD" && "Gold Package"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    £{(gardenSub.priceMonthlyPence / 100).toFixed(0)}/month · Direct Debit
                  </p>
                </div>
                <Badge
                  variant={
                    gardenSub.status === "ACTIVE"
                      ? "success"
                      : gardenSub.status === "CANCELLED" || gardenSub.status === "MANDATE_FAILED"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {gardenSub.status === "PENDING_MANDATE" && "Setting up payment"}
                  {gardenSub.status === "PENDING_TPV" && "Awaiting verification call"}
                  {gardenSub.status === "ACTIVE" && "Active"}
                  {gardenSub.status === "CANCELLED" && "Cancelled"}
                  {gardenSub.status === "MANDATE_FAILED" && "Payment setup failed"}
                </Badge>
              </div>

              {gardenSub.status === "PENDING_TPV" && (
                <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                  <span>
                    We&apos;ll phone you on <strong>{customer.phone}</strong> to confirm your subscription — this is a legal requirement for Direct Debit agreements (DMCC). The call takes around 2 minutes.
                  </span>
                </div>
              )}

              <div className="text-sm text-muted-foreground">
                <span className="font-medium">Service address: </span>
                {[gardenSub.serviceAddressLine1, gardenSub.serviceAddressLine2, gardenSub.serviceCity, gardenSub.servicePostcode].filter(Boolean).join(", ")}
              </div>

              {gardenSub.plan === "LAWN" && (
                <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-0.5">
                  <li>Monthly lawn mowing &amp; edging</li>
                  <li>Grass cuttings cleared</li>
                </ul>
              )}
              {gardenSub.plan === "SILVER" && (
                <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-0.5">
                  <li>Monthly lawn mowing &amp; edging</li>
                  <li>Hedge trimming (up to 3 hedges)</li>
                  <li>Cuttings cleared</li>
                </ul>
              )}
              {gardenSub.plan === "GOLD" && (
                <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-0.5">
                  <li>Monthly lawn mowing &amp; edging</li>
                  <li>Hedge trimming (up to 3 hedges)</li>
                  <li>Weeding of beds &amp; borders</li>
                  <li>All cuttings cleared</li>
                </ul>
              )}

              <p className="text-xs text-muted-foreground">
                14-day cooling-off period. Cancel anytime with 30 days notice — call{" "}
                <a href="tel:07447804597" className="underline">07447 804597</a>.
              </p>
            </CardContent>
          </Card>
        )}

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

      <LegalFooter />
    </div>
  );
}
