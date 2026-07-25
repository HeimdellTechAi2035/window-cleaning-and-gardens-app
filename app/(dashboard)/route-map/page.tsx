import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, formatDate, cn } from "@/lib/utils";
import { RouteMap } from "@/components/maps/route-map";
import { GeocodeBackfillBanner } from "@/components/maps/geocode-backfill-banner";

export default async function RouteMapPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const session = await auth();
  const { date: dateParam, view } = await searchParams;
  const date = dateParam ? new Date(dateParam) : new Date();
  const showAllCustomers = view === "all";

  const missingCoordinatesCount = await prisma.property.count({
    where: {
      customer: { organizationId: session!.user.organizationId },
      OR: [{ latitude: null }, { longitude: null }],
    },
  });

  const tabs = (
    <div className="inline-flex w-fit rounded-lg border border-border bg-muted/40 p-1 text-sm">
      <Link
        href={`/route-map${dateParam ? `?date=${dateParam}` : ""}`}
        className={cn(
          "rounded-md px-3 py-1.5 font-medium transition-colors",
          !showAllCustomers ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
        )}
      >
        Today&apos;s route
      </Link>
      <Link
        href="/route-map?view=all"
        className={cn(
          "rounded-md px-3 py-1.5 font-medium transition-colors",
          showAllCustomers ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
        )}
      >
        All customers
      </Link>
    </div>
  );

  if (showAllCustomers) {
    const properties = await prisma.property.findMany({
      where: {
        customer: { organizationId: session!.user.organizationId },
        latitude: { not: null },
        longitude: { not: null },
      },
      include: { customer: true },
    });

    const stops = properties.map((property) => ({
      id: property.id,
      latitude: property.latitude as number,
      longitude: property.longitude as number,
      sequenceOrder: null,
      status: "SCHEDULED" as const,
      address: `${property.addressLine1}, ${property.city}`,
      serviceTitle: null,
      customerName: `${property.customer.firstName} ${property.customer.lastName}`,
    }));

    return (
      <div className="flex flex-col gap-4">
        {tabs}
        <p className="text-sm text-muted-foreground">{stops.length} customers with geocoded addresses</p>
        <GeocodeBackfillBanner missingCount={missingCoordinatesCount} />
        <RouteMap date={startOfDay(date).toISOString()} stops={stops} showRoute={false} />
      </div>
    );
  }

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
    address: `${job.property.addressLine1}, ${job.property.city}`,
    serviceTitle: job.service.title,
    customerName: `${job.property.customer.firstName} ${job.property.customer.lastName}`,
  }));

  return (
    <div className="flex flex-col gap-4">
      {tabs}
      <p className="text-sm text-muted-foreground">
        {formatDate(date, { weekday: "long", day: "2-digit", month: "long" })} · {stops.length} stops
        with geocoded addresses
      </p>
      <GeocodeBackfillBanner missingCount={missingCoordinatesCount} />
      <RouteMap date={startOfDay(date).toISOString()} stops={stops} />
    </div>
  );
}
