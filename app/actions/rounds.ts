"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assignPropertyToRound } from "@/lib/rounds";

async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  return session;
}

const roundSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  colorCode: z.string().min(1),
});

export async function createRoundAction(formData: FormData) {
  const session = await requireSession();
  const parsed = roundSchema.parse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    colorCode: formData.get("colorCode") || "#6366f1",
  });

  await prisma.round.create({
    data: {
      organizationId: session.user.organizationId,
      name: parsed.name,
      description: parsed.description,
      colorCode: parsed.colorCode,
    },
  });

  revalidatePath("/rounds");
}

export async function scheduleJobAction(params: {
  roundId: string;
  propertyId: string;
  serviceId: string;
  scheduledDate: string;
}) {
  const session = await requireSession();

  const service = await prisma.service.findFirstOrThrow({
    where: { id: params.serviceId },
  });

  await prisma.job.create({
    data: {
      organizationId: session.user.organizationId,
      roundId: params.roundId,
      propertyId: params.propertyId,
      serviceId: params.serviceId,
      scheduledDate: new Date(params.scheduledDate),
      priceCharged: service.price,
      intervalWeeksAtCreation: service.defaultIntervalWeeks,
    },
  });

  revalidatePath("/rounds");
  revalidatePath("/planner");
}

/**
 * Merges one round into another: every job on the source round moves to
 * the target, then the (now-empty) source round is deleted. Used to clean
 * up duplicate rounds — e.g. a "Presston" typo round that should really
 * be "Preston".
 */
export async function mergeRoundsAction(params: { sourceRoundId: string; targetRoundId: string }) {
  const session = await requireSession();
  if (params.sourceRoundId === params.targetRoundId) return;

  const [source, target] = await Promise.all([
    prisma.round.findFirstOrThrow({
      where: { id: params.sourceRoundId, organizationId: session.user.organizationId },
    }),
    prisma.round.findFirstOrThrow({
      where: { id: params.targetRoundId, organizationId: session.user.organizationId },
    }),
  ]);

  await prisma.job.updateMany({ where: { roundId: source.id }, data: { roundId: target.id } });
  await prisma.property.updateMany({ where: { roundId: source.id }, data: { roundId: target.id } });
  await prisma.round.delete({ where: { id: source.id } });

  revalidatePath("/rounds");
  revalidatePath("/planner");
  revalidatePath("/dashboard");
}

/**
 * Manually moves a single property (and all its jobs) onto a different
 * round, and locks it there so a later address edit won't auto-reassign
 * it back. This is the lever for splitting a big area round like
 * "Preston" into day-sized sub-rounds once it's grown too large for one
 * crew to cover — create the new round first, then move properties into
 * it one at a time (or a few at a time) from the round's detail page.
 */
export async function moveToRoundAction(params: { propertyId: string; targetRoundId: string }) {
  const session = await requireSession();

  const [property, targetRound] = await Promise.all([
    prisma.property.findFirstOrThrow({
      where: { id: params.propertyId, customer: { organizationId: session.user.organizationId } },
    }),
    prisma.round.findFirstOrThrow({
      where: { id: params.targetRoundId, organizationId: session.user.organizationId },
    }),
  ]);

  await assignPropertyToRound(property.id, targetRound.id, { locked: true });

  revalidatePath("/rounds");
  revalidatePath("/customers");
  revalidatePath("/planner");
  revalidatePath("/dashboard");
}
