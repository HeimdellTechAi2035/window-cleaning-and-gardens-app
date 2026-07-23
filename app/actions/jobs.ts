"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as jobsLib from "@/lib/jobs";
import type { SkipReason } from "@prisma/client";

async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  return session;
}

export async function completeJobAction(params: {
  jobId: string;
  beforePhotoUrl?: string;
  afterPhotoUrl?: string;
  workerNotes?: string;
}) {
  const session = await requireSession();

  const job = await prisma.job.findFirstOrThrow({
    where: { id: params.jobId, organizationId: session.user.organizationId },
  });

  const result = await jobsLib.completeJob({
    jobId: job.id,
    completedByWorkerId: session.user.id,
    beforePhotoUrl: params.beforePhotoUrl,
    afterPhotoUrl: params.afterPhotoUrl,
    workerNotes: params.workerNotes,
  });

  revalidatePath("/planner");
  revalidatePath("/dashboard");
  revalidatePath("/financials");
  return { jobId: result.job.id, paymentStatus: result.job.paymentStatus, gateway: result.payment.gateway };
}

export async function skipJobAction(params: {
  jobId: string;
  reason: SkipReason;
  note?: string;
  chargePartialFee: boolean;
  partialFeeAmount?: number;
}) {
  const session = await requireSession();

  const job = await prisma.job.findFirstOrThrow({
    where: { id: params.jobId, organizationId: session.user.organizationId },
  });

  const result = await jobsLib.skipJob({
    jobId: job.id,
    reason: params.reason,
    note: params.note,
    chargePartialFee: params.chargePartialFee,
    partialFeeAmount: params.partialFeeAmount,
  });

  revalidatePath("/planner");
  revalidatePath("/dashboard");
  return { jobId: result.job.id };
}

export async function pushRoundAction(params: { date: string; hours: 24 | 48 }) {
  const session = await requireSession();

  const updated = await jobsLib.pushIncompleteJobsForDay({
    organizationId: session.user.organizationId,
    date: new Date(params.date),
    hours: params.hours,
  });

  revalidatePath("/planner");
  return { count: updated.length };
}

export async function reorderJobsAction(order: { jobId: string; sequenceOrder: number }[]) {
  const session = await requireSession();

  const jobIds = order.map((o) => o.jobId);
  const count = await prisma.job.count({
    where: { id: { in: jobIds }, organizationId: session.user.organizationId },
  });
  if (count !== jobIds.length) throw new Error("Job not found in organization");

  await jobsLib.reorderJobs(order);
  revalidatePath("/planner");
}
