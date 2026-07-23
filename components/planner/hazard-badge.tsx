import { AlertTriangle, KeyRound, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { HazardSeverity } from "@prisma/client";

const severityStyles: Record<HazardSeverity, string> = {
  HIGH: "bg-destructive/15 text-destructive border-destructive/20",
  MEDIUM: "bg-warning/15 text-warning border-warning/20",
  LOW: "bg-muted text-muted-foreground border-border",
};

function iconFor(label: string) {
  const lower = label.toLowerCase();
  if (lower.includes("key") || lower.includes("code")) return KeyRound;
  if (lower.includes("dog") || lower.includes("aggress")) return ShieldAlert;
  return AlertTriangle;
}

export function HazardBadge({ label, severity }: { label: string; severity: HazardSeverity }) {
  const Icon = iconFor(label);
  return (
    <Badge className={cn("glass border font-semibold", severityStyles[severity])}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
