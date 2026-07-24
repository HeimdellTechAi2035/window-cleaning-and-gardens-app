"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "@/components/planner/job-status-badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { updateJobDateAction } from "@/app/actions/jobs";
import type { JobStatus } from "@prisma/client";

export interface JobHistoryRowData {
  id: string;
  serviceTitle: string;
  scheduledDate: string;
  priceCharged: number;
  status: JobStatus;
}

const EDITABLE_STATUSES: JobStatus[] = ["SCHEDULED", "IN_PROGRESS"];

export function JobHistoryRow({ job }: { job: JobHistoryRowData }) {
  const editable = EDITABLE_STATUSES.includes(job.status);
  const [date, setDate] = useState(job.scheduledDate.slice(0, 10));
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateJobDateAction({ jobId: job.id, scheduledDate: date });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-2.5 text-sm">
      <div>
        <p className="font-medium">{job.serviceTitle}</p>
        {editable ? (
          <div className="mt-1 flex items-center gap-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-7 w-auto text-xs"
            />
            {date !== job.scheduledDate.slice(0, 10) && (
              <Button size="sm" variant="outline" onClick={handleSave} disabled={isPending} className="h-7 px-2">
                {isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : saved ? (
                  <Check className="h-3 w-3 text-success" />
                ) : null}
                {saved ? "Saved" : "Save date"}
              </Button>
            )}
          </div>
        ) : null}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        {!editable && (
          <p className="text-xs text-muted-foreground">{formatDate(job.scheduledDate)}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span>{formatCurrency(job.priceCharged)}</span>
        <JobStatusBadge status={job.status} />
      </div>
    </div>
  );
}
