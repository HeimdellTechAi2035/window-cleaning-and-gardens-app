import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, formatDate } from "@/lib/utils";
import { WeatherPushModal } from "@/components/planner/weather-push-modal";
import { JobCard, type JobCardData } from "@/components/planner/job-card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays } from "lucide-react";

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth();
  const { date: dateParam } = await searchParams;
  const date = dateParam ? new Date(dateParam) : new Date();

  const jobs = await prisma.job.findMany({
    where: {
      organizationId: session!.user.organizationId,
      scheduledDate: { gte: startOfDay(date), lte: endOfDay(date) },
    },
    include: {
      service: true,
      property: {
        include: {
          customer: true,
          hazards: true,
        },
      },
    },
    orderBy: [{ sequenceOrder: "asc" }, { scheduledDate: "asc" }],
  });

  const jobCards: JobCardData[] = jobs.map((job) => ({
    id: job.id,
    status: job.status,
    scheduledDate: job.scheduledDate.toISOString(),
    priceCharged: Number(job.priceCharged),
    sequenceOrder: job.sequenceOrder,
    serviceTitle: job.service.title,
    customerName: `${job.property.customer.firstName} ${job.property.customer.lastName}`,
    addressLine1: job.property.addressLine1,
    city: job.property.city,
    postcode: job.property.postcode,
    latitude: job.property.latitude,
    longitude: job.property.longitude,
    hazards: job.property.hazards.map((h) => ({ id: h.id, label: h.label, severity: h.severity })),
    accessNotes: job.property.accessNotes,
  }));

  const completedCount = jobs.filter((j) => j.status === "COMPLETED").length;
  const totalValue = jobs.reduce((sum, j) => sum + Number(j.priceCharged), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-semibold">{formatDate(date, { weekday: "long", day: "2-digit", month: "long" })}</p>
            <p className="text-sm text-muted-foreground">
              {completedCount}/{jobs.length} completed · £{totalValue.toFixed(2)} scheduled
            </p>
          </div>
        </div>
        <WeatherPushModal date={startOfDay(date).toISOString()} />
      </div>

      {jobCards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No jobs scheduled for this day.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {jobCards.map((job) => (
            <JobCard key={job.id} job={job} draggable />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <Badge variant="outline">Route order reflects last optimization run</Badge>
      </div>
    </div>
  );
}
