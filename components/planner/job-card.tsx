"use client";

import { useState } from "react";
import { MapPin, Navigation2, CheckCircle2, XCircle, GripVertical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HazardBadge } from "./hazard-badge";
import { JobStatusBadge } from "./job-status-badge";
import { CompleteJobDialog } from "./complete-job-dialog";
import { SkipJobDialog } from "./skip-job-dialog";
import { formatCurrency, cn } from "@/lib/utils";
import { googleMapsNavigationUrl, wazeNavigationUrl } from "@/lib/route-optimizer";
import type { HazardSeverity, JobStatus } from "@prisma/client";

export interface JobCardData {
  id: string;
  status: JobStatus;
  scheduledDate: string;
  priceCharged: number;
  sequenceOrder: number;
  serviceTitle: string;
  customerName: string;
  addressLine1: string;
  city: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  hazards: { id: string; label: string; severity: HazardSeverity }[];
  accessNotes: string | null;
}

export function JobCard({ job, draggable = false }: { job: JobCardData; draggable?: boolean }) {
  const [completeOpen, setCompleteOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);

  const isResolved = job.status === "COMPLETED" || job.status === "SKIPPED";
  const canNavigate = job.latitude != null && job.longitude != null;

  return (
    <Card className={cn("overflow-hidden transition-opacity", isResolved && "opacity-70")}>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            {draggable && (
              <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
            )}
            <div>
              <p className="font-semibold leading-tight">{job.serviceTitle}</p>
              <p className="text-sm text-muted-foreground">{job.customerName}</p>
            </div>
          </div>
          <JobStatusBadge status={job.status} />
        </div>

        <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {job.addressLine1}, {job.city} {job.postcode}
          </span>
        </div>

        {job.hazards.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {job.hazards.map((h) => (
              <HazardBadge key={h.id} label={h.label} severity={h.severity} />
            ))}
          </div>
        )}

        {job.accessNotes && (
          <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
            {job.accessNotes}
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-lg font-semibold">{formatCurrency(job.priceCharged)}</span>

          <div className="flex gap-2">
            {canNavigate && (
              <>
                <a
                  href={googleMapsNavigationUrl({ latitude: job.latitude!, longitude: job.longitude! })}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button variant="outline" size="sm">
                    <Navigation2 className="h-4 w-4" />
                    Maps
                  </Button>
                </a>
                <a
                  href={wazeNavigationUrl({ latitude: job.latitude!, longitude: job.longitude! })}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button variant="outline" size="sm">
                    Waze
                  </Button>
                </a>
              </>
            )}
          </div>
        </div>

        {!isResolved && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outline" onClick={() => setSkipOpen(true)}>
              <XCircle className="h-4 w-4" />
              Skip
            </Button>
            <Button variant="success" onClick={() => setCompleteOpen(true)}>
              <CheckCircle2 className="h-4 w-4" />
              Complete
            </Button>
          </div>
        )}
      </CardContent>

      <CompleteJobDialog
        jobId={job.id}
        serviceTitle={job.serviceTitle}
        open={completeOpen}
        onOpenChange={setCompleteOpen}
      />
      <SkipJobDialog
        jobId={job.id}
        serviceTitle={job.serviceTitle}
        defaultPrice={job.priceCharged}
        open={skipOpen}
        onOpenChange={setSkipOpen}
      />
    </Card>
  );
}
