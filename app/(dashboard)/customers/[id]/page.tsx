import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PropertyPanel } from "@/components/customers/property-panel";
import { DirectDebitInviteModal } from "@/components/payments/direct-debit-invite-modal";
import { JobStatusBadge } from "@/components/planner/job-status-badge";
import { formatCurrency, formatDate, initials } from "@/lib/utils";
import { Mail, Phone } from "lucide-react";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  const customer = await prisma.customer.findFirst({
    where: { id, organizationId: session!.user.organizationId },
    include: {
      properties: {
        include: { hazards: true, services: true },
      },
    },
  });

  if (!customer) notFound();

  const jobs = await prisma.job.findMany({
    where: { property: { customerId: customer.id } },
    include: { service: true },
    orderBy: { scheduledDate: "desc" },
    take: 10,
  });

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
              {initials(customer.firstName, customer.lastName)}
            </div>
            <div>
              <p className="text-lg font-semibold">
                {customer.firstName} {customer.lastName}
              </p>
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                {customer.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" /> {customer.email}
                  </span>
                )}
                {customer.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {customer.phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline">{customer.preferredPaymentMethod.replace("_", " ")}</Badge>
            {customer.mandateStatus && (
              <Badge variant={customer.mandateStatus === "active" ? "success" : "secondary"}>
                Mandate: {customer.mandateStatus}
              </Badge>
            )}
            <DirectDebitInviteModal customerId={customer.id} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {customer.properties.map((property) => (
          <Card key={property.id}>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase text-muted-foreground">
                Property
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PropertyPanel
                property={{
                  id: property.id,
                  addressLine1: property.addressLine1,
                  city: property.city,
                  postcode: property.postcode,
                  accessNotes: property.accessNotes,
                  hazards: property.hazards,
                  services: property.services.map((s) => ({
                    id: s.id,
                    title: s.title,
                    price: Number(s.price),
                    defaultIntervalWeeks: s.defaultIntervalWeeks,
                  })),
                }}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Job history</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {jobs.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No jobs yet.</p>
          )}
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5 text-sm">
              <div>
                <p className="font-medium">{job.service.title}</p>
                <p className="text-xs text-muted-foreground">{formatDate(job.scheduledDate)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span>{formatCurrency(Number(job.priceCharged))}</span>
                <JobStatusBadge status={job.status} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
