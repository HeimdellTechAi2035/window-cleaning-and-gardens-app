import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PropertyPanel } from "@/components/customers/property-panel";
import { DirectDebitInviteModal } from "@/components/payments/direct-debit-invite-modal";
import { SendPaymentLinkModal } from "@/components/payments/send-payment-link-modal";
import { EditCustomerDialog } from "@/components/customers/edit-customer-dialog";
import { CopyPortalLinkButton } from "@/components/customers/copy-portal-link-button";
import { JobHistoryRow } from "@/components/planner/job-history-row";
import { initials } from "@/lib/utils";
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
            <CopyPortalLinkButton portalToken={customer.portalToken} />
            <SendPaymentLinkModal customerId={customer.id} />
            <DirectDebitInviteModal customerId={customer.id} />
            <EditCustomerDialog
              customer={{
                id: customer.id,
                firstName: customer.firstName,
                lastName: customer.lastName,
                email: customer.email,
                phone: customer.phone,
                preferredPaymentMethod: customer.preferredPaymentMethod,
                property: customer.properties[0]
                  ? {
                      id: customer.properties[0].id,
                      addressLine1: customer.properties[0].addressLine1,
                      city: customer.properties[0].city,
                      postcode: customer.properties[0].postcode,
                    }
                  : undefined,
              }}
            />
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
            <JobHistoryRow
              key={job.id}
              job={{
                id: job.id,
                serviceTitle: job.service.title,
                scheduledDate: job.scheduledDate.toISOString(),
                priceCharged: Number(job.priceCharged),
                status: job.status,
              }}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
