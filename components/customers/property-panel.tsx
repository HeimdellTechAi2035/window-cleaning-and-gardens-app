"use client";

import { useState, useTransition } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HazardBadge } from "@/components/planner/hazard-badge";
import {
  addHazardAction,
  removeHazardAction,
  addServiceAction,
  updateAccessNotesAction,
} from "@/app/actions/customers";
import { formatCurrency } from "@/lib/utils";
import type { HazardSeverity } from "@prisma/client";

export interface PropertyPanelData {
  id: string;
  addressLine1: string;
  city: string;
  postcode: string;
  accessNotes: string | null;
  hazards: { id: string; label: string; severity: HazardSeverity }[];
  services: { id: string; title: string; price: number; defaultIntervalWeeks: number }[];
}

export function PropertyPanel({ property }: { property: PropertyPanelData }) {
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState(property.accessNotes ?? "");
  const [hazardLabel, setHazardLabel] = useState("");
  const [hazardSeverity, setHazardSeverity] = useState<HazardSeverity>("MEDIUM");
  const [serviceTitle, setServiceTitle] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [serviceInterval, setServiceInterval] = useState("4");

  function saveNotes() {
    startTransition(() => updateAccessNotesAction({ propertyId: property.id, accessNotes: notes }));
  }

  function submitHazard() {
    if (!hazardLabel.trim()) return;
    startTransition(async () => {
      await addHazardAction({ propertyId: property.id, label: hazardLabel, severity: hazardSeverity });
      setHazardLabel("");
    });
  }

  function submitService() {
    if (!serviceTitle.trim() || !servicePrice) return;
    startTransition(async () => {
      await addServiceAction({
        propertyId: property.id,
        title: serviceTitle,
        price: Number(servicePrice),
        defaultIntervalWeeks: Number(serviceInterval),
      });
      setServiceTitle("");
      setServicePrice("");
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm font-medium">
          {property.addressLine1}, {property.city} {property.postcode}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Hazards</p>
        <div className="flex flex-wrap gap-1.5">
          {property.hazards.map((h) => (
            <div key={h.id} className="group relative">
              <HazardBadge label={h.label} severity={h.severity} />
              <button
                onClick={() => startTransition(() => removeHazardAction(h.id))}
                className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-white group-hover:flex"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="e.g. Aggressive Dog"
            value={hazardLabel}
            onChange={(e) => setHazardLabel(e.target.value)}
            className="h-8 min-w-0 flex-1 basis-32 text-xs"
          />
          <select
            value={hazardSeverity}
            onChange={(e) => setHazardSeverity(e.target.value as HazardSeverity)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
          <Button size="sm" variant="outline" onClick={submitHazard} disabled={isPending}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Access notes</p>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="e.g. Key safe code 4821, rear gate via side path"
          className="text-sm"
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Services</p>
        <div className="flex flex-col gap-1.5">
          {property.services.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <span>{s.title}</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {s.defaultIntervalWeeks === 0 ? "One-off" : `Every ${s.defaultIntervalWeeks}wk`}
                </Badge>
                <span className="font-medium">{formatCurrency(s.price)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_5rem_5rem_2.5rem]">
          <Input
            placeholder="Standard Window Clean"
            value={serviceTitle}
            onChange={(e) => setServiceTitle(e.target.value)}
            className="col-span-2 h-8 text-xs sm:col-span-1"
          />
          <Input
            placeholder="£"
            type="number"
            step="0.01"
            value={servicePrice}
            onChange={(e) => setServicePrice(e.target.value)}
            className="h-8 text-xs"
          />
          <select
            value={serviceInterval}
            onChange={(e) => setServiceInterval(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="0">One-off</option>
            <option value="4">4wk</option>
            <option value="8">8wk</option>
            <option value="12">12wk</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={submitService}
            disabled={isPending}
            className="col-span-2 sm:col-span-1"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
