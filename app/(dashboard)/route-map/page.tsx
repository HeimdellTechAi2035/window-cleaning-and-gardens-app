import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, formatDate } from "@/lib/utils";
import { RouteMap } from "@/components/maps/route-map";

export default async function RouteMapPage({
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
      property: { latitude: { not: null }, longitude: { not: null } },
    },
    include: { service: true, property: { include: { customer: true } } },
    orderBy: { sequenceOrder: "asc" },
  });

  const stops = jobs.map((job) => ({
    id: job.id,
    latitude: job.property.latitude as number,
    longitude: job.property.longitude as number,
    sequenceOrder: job.sequenceOrder,
    status: job.status,
    serviceTitle: job.service.title,
    customerName: `${job.property.customer.firstName} ${job.property.customer.lastName}`,
  }));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {formatDate(date, { weekday: "long", day: "2-digit", month: "long" })} · {stops.length} stops
        with geocoded addresses
      </p>
      <RouteMap date={startOfDay(date).toISOString()} stops={stops} />
    </div>
  );
}
