import { prisma } from "@/lib/prisma";
import { addWeeks, endOfDay, startOfDay } from "@/lib/utils";
import { triggerPostJobPayment } from "@/lib/payments";
import type { SkipReason } from "@prisma/client";

/**
 * Schedules the next occurrence of a job once the current one is resolved
 * (completed or skipped-and-carried-forward). The next date is always
 * computed from the *original* scheduled_date plus the service's interval,
 * never from "today" — this is what keeps a 4/8-week round cycle stable
 * even if an individual visit ran late or was pushed for weather.
 */
async function scheduleNextOccurrence(jobId: string) {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { service: true },
  });

  if (job.service.defaultIntervalWeeks <= 0) return null; // one-off job, no recurrence

  const nextDate = addWeeks(job.scheduledDate, job.service.defaultIntervalWeeks);

  return prisma.job.create({
    data: {
      organizationId: job.organizationId,
      roundId: job.roundId,
      propertyId: job.propertyId,
      serviceId: job.serviceId,
      assignedWorkerId: job.assignedWorkerId,
      scheduledDate: nextDate,
      sequenceOrder: job.sequenceOrder,
      intervalWeeksAtCreation: job.service.defaultIntervalWeeks,
      priceCharged: job.service.price,
      status: "SCHEDULED",
    },
  });
}

export async function completeJob(params: {
  jobId: string;
  completedByWorkerId: string;
  beforePhotoUrl?: string;
  afterPhotoUrl?: string;
  workerNotes?: string;
}) {
  const job = await prisma.job.update({
    where: { id: params.jobId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      completedByWorkerId: params.completedByWorkerId,
      beforePhotoUrl: params.beforePhotoUrl,
      afterPhotoUrl: params.afterPhotoUrl,
      workerNotes: params.workerNotes,
    },
    include: {
      service: true,
      property: { include: { customer: true } },
    },
  });

  const nextJob = await scheduleNextOccurrence(job.id);
  const payment = await triggerPostJobPayment(job);

  return { job, nextJob, payment };
}

export async function skipJob(params: {
  jobId: string;
  reason: SkipReason;
  note?: string;
  chargePartialFee: boolean;
  partialFeeAmount?: number;
}) {
  const job = await prisma.job.update({
    where: { id: params.jobId },
    data: {
      status: "SKIPPED",
      skipReason: params.reason,
      skipNote: params.note,
      carriedForward: !params.chargePartialFee,
      priceCharged: params.chargePartialFee
        ? (params.partialFeeAmount ?? 0)
        : undefined,
    },
    include: {
      service: true,
      property: { include: { customer: true } },
    },
  });

  const nextJob = await scheduleNextOccurrence(job.id);

  let payment = null;
  if (params.chargePartialFee && Number(job.priceCharged) > 0) {
    payment = await triggerPostJobPayment(job);
  }

  return { job, nextJob, payment };
}

/**
 * Weather Delay Engine: bulk-pushes every incomplete job scheduled for
 * `date` forward by `hours`, without touching intervalWeeksAtCreation or
 * generating next-cycle jobs — the round's underlying repeat cadence is
 * untouched, only this specific day's visits move.
 */
export async function pushIncompleteJobsForDay(params: {
  organizationId: string;
  date: Date;
  hours: 24 | 48;
}) {
  const jobs = await prisma.job.findMany({
    where: {
      organizationId: params.organizationId,
      scheduledDate: { gte: startOfDay(params.date), lte: endOfDay(params.date) },
      status: { in: ["SCHEDULED", "IN_PROGRESS"] },
    },
  });

  const results = await Promise.all(
    jobs.map((job) =>
      prisma.job.update({
        where: { id: job.id },
        data: {
          scheduledDate: new Date(job.scheduledDate.getTime() + params.hours * 60 * 60 * 1000),
        },
      })
    )
  );

  return results;
}

export async function reorderJobs(params: { jobId: string; sequenceOrder: number }[]) {
  return prisma.$transaction(
    params.map(({ jobId, sequenceOrder }) =>
      prisma.job.update({ where: { id: jobId }, data: { sequenceOrder } })
    )
  );
}
