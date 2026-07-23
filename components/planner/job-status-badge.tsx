import { Badge } from "@/components/ui/badge";
import type { JobStatus } from "@prisma/client";

const statusConfig: Record<JobStatus, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" }> = {
  SCHEDULED: { label: "Scheduled", variant: "default" },
  IN_PROGRESS: { label: "In Progress", variant: "warning" },
  COMPLETED: { label: "Completed", variant: "success" },
  SKIPPED: { label: "Skipped", variant: "secondary" },
  RESCHEDULED: { label: "Rescheduled", variant: "secondary" },
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
