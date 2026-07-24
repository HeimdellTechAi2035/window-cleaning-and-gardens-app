import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HazardBadge } from "@/components/planner/hazard-badge";
import { JobStatusBadge } from "@/components/planner/job-status-badge";
import { MoveToRoundModal } from "@/components/rounds/move-to-round-modal";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft, MapPin, Repeat, Split } from "lucide-react";

const SPLIT_SUGGESTION_THRESHOLD = 15;

export default async function RoundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  const round = await prisma.round.findFirst({
    where: { id, organizationId: session!.user.organizationId },
  });

  if (!round) notFound();

  const [properties, otherRounds] = await Promise.all([
    prisma.property.findMany({
      where: { roundId: round.id },
      include: {
        customer: true,
        hazards: true,
        services: true,
        jobs: {
          where: { roundId: round.id },
          orderBy: { scheduledDate: "desc" },
          take: 1,
        },
      },
      orderBy: { addressLine1: "asc" },
    }),
    prisma.round.findMany({
      where: { organizationId: session!.user.organizationId, id: { not: round.id } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/rounds"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All rounds
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${round.colorCode}22`, color: round.colorCode }}
          >
            <Repeat className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold">{round.name}</p>
            {round.description && (
              <p className="text-sm text-muted-foreground">{round.description}</p>
            )}
          </div>
        </div>
        <Badge variant={round.isActive ? "success" : "secondary"}>
          {round.isActive ? "Active" : "Paused"}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        {properties.length} propert{properties.length === 1 ? "y" : "ies"} in this round
      </p>

      {properties.length >= SPLIT_SUGGESTION_THRESHOLD && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm">
          <Split className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            This round has grown to {properties.length} properties — that may be more than one
            crew can cover in a day. Consider creating a new round (e.g. &quot;{round.name} —
            Zone 2&quot;) on the Rounds page, then use <strong>Move to round</strong> below on
            each property you want to split off.
          </p>
        </div>
      )}

      {properties.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No properties in this round yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {properties.map((property) => {
            const latestJob = property.jobs[0];
            return (
              <Card key={property.id} className="h-full">
                <CardContent className="flex flex-col gap-3 p-5">
                  <Link href={`/customers/${property.customerId}`}>
                    <div>
                      <p className="font-semibold hover:text-primary">
                        {property.customer.firstName} {property.customer.lastName}
                      </p>
                      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                        {property.addressLine1}, {property.city} {property.postcode}
                      </p>
                    </div>
                  </Link>

                  {property.hazards.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {property.hazards.map((h) => (
                        <HazardBadge key={h.id} label={h.label} severity={h.severity} />
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    {property.services.map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-sm">
                        <span>{s.title}</span>
                        <span className="font-medium">{formatCurrency(Number(s.price))}</span>
                      </div>
                    ))}
                  </div>

                  {latestJob && (
                    <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                      <span className="text-muted-foreground">
                        {formatDate(latestJob.scheduledDate)}
                      </span>
                      <JobStatusBadge status={latestJob.status} />
                    </div>
                  )}

                  <div className="flex justify-end border-t border-border pt-3">
                    <MoveToRoundModal
                      propertyId={property.id}
                      customerName={`${property.customer.firstName} ${property.customer.lastName}`}
                      currentRoundName={round.name}
                      otherRounds={otherRounds}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
