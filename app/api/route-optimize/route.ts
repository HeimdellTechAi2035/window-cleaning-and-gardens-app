import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { optimizeRouteWithMapbox } from "@/lib/route-optimizer";
import { startOfDay, endOfDay } from "@/lib/utils";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { date: string; depot?: { latitude: number; longitude: number } };
  const date = new Date(body.date);

  const jobs = await prisma.job.findMany({
    where: {
      organizationId: session.user.organizationId,
      scheduledDate: { gte: startOfDay(date), lte: endOfDay(date) },
      status: { in: ["SCHEDULED", "IN_PROGRESS"] },
    },
    include: { property: true },
  });

  const stops = jobs
    .filter((j) => j.property.latitude != null && j.property.longitude != null)
    .map((j) => ({
      id: j.id,
      latitude: j.property.latitude as number,
      longitude: j.property.longitude as number,
    }));

  const depot = body.depot ? { id: "depot", ...body.depot } : stops[0];
  if (!depot) {
    return NextResponse.json({ stops: [], totalDistanceMeters: 0, totalDurationSeconds: 0 });
  }

  const result = await optimizeRouteWithMapbox(depot, stops);

  await prisma.$transaction(
    result.stops.map((stop) =>
      prisma.job.update({
        where: { id: stop.id },
        data: { sequenceOrder: stop.sequenceOrder },
      })
    )
  );

  return NextResponse.json(result);
}
