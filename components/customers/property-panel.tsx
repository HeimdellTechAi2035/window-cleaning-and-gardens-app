"use client";

import { useState, useTransition } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HazardBadge } from "@/components/planner/hazard-badge";
import {
  addHazardAction,
  removeHazardAction,
  addServiceAction,
  updateAccessNotesAction,
} from "@/app/actions/customers";
import { formatCurrency, cn } from "@/lib/utils";
import { servicePresets } from "@/lib/service-presets";
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
  const [presetOpen, setPresetOpen] = useState<Record<string, boolean>>({});
  const [presetPrices, setPresetPrices] = useState<Record<string, string>>(
    Object.fromEntries(servicePresets.map((p) => [p.key, p.defaultPrice]))
  );
  const [presetIntervals, setPresetIntervals] = useState<Record<string, string>>(
    Object.fromEntries(servicePresets.map((p) => [p.key, p.defaultIntervalWeeks]))
  );
  const today = () => new Date().toISOString().slice(0, 10);
  const [presetDates, setPresetDates] = useState<Record<string, string>>(
    Object.fromEntries(servicePresets.map((p) => [p.key, today()]))
  );
  const [serviceDate, setServiceDate] = useState(today());

  const existingTitles = new Set(property.services.map((s) => s.title.toLowerCase()));
  const availablePresets = servicePresets.filter((p) => !existingTitles.has(p.title.toLowerCase()));

  function submitPreset(presetKey: string, title: string) {
    const price = Number(presetPrices[presetKey]);
    if (!price || price <= 0) return;
    startTransition(async () => {
      await addServiceAction({
        propertyId: property.id,
        title,
        price,
        defaultIntervalWeeks: Number(presetIntervals[presetKey]),
        scheduledDate: presetDates[presetKey],
      });
      setPresetOpen((prev) => ({ ...prev, [presetKey]: false }));
    });
  }

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
        scheduledDate: serviceDate,
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
                  {s.defaultIntervalWeeks === 0
                    ? "One-off"
                    : s.defaultIntervalWeeks === 1
                      ? "Weekly"
                      : s.defaultIntervalWeeks === 2
                        ? "Fortnightly"
                        : `Every ${s.defaultIntervalWeeks}wk`}
                </Badge>
                <span className="font-medium">{formatCurrency(s.price)}</span>
              </div>
            </div>
          ))}
        </div>

        {availablePresets.length > 0 && (
          <div className="mt-1 flex flex-col gap-1.5 border-t border-border pt-3">
            {availablePresets.map((preset) => {
              const Icon = preset.icon;
              const isOpen = !!presetOpen[preset.key];
              return (
                <div
                  key={preset.key}
                  className={cn(
                    "rounded-lg border transition-colors",
                    isOpen ? "border-primary/40 bg-primary/5" : "border-border"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setPresetOpen((prev) => ({ ...prev, [preset.key]: !prev[preset.key] }))}
                    className="flex w-full items-center justify-between px-3 py-2"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Icon className={cn("h-4 w-4", isOpen ? "text-primary" : "text-muted-foreground")} />
                      {preset.title}
                    </span>
                    <Plus
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        isOpen && "rotate-45"
                      )}
                    />
                  </button>
                  {isOpen && (
                    <div className="flex flex-col gap-2 px-3 pb-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-muted-foreground">Price (£)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={presetPrices[preset.key]}
                            onChange={(e) =>
                              setPresetPrices((prev) => ({ ...prev, [preset.key]: e.target.value }))
                            }
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-muted-foreground">Repeat every</Label>
                          <select
                            value={presetIntervals[preset.key]}
                            onChange={(e) =>
                              setPresetIntervals((prev) => ({ ...prev, [preset.key]: e.target.value }))
                            }
                            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                          >
                            <option value="0">One-off</option>
                            <option value="1">Weekly</option>
                            <option value="2">Fortnightly</option>
                            <option value="4">4 weeks</option>
                            <option value="8">8 weeks</option>
                            <option value="12">12 weeks</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex flex-1 flex-col gap-1">
                          <Label className="text-xs text-muted-foreground">First visit</Label>
                          <Input
                            type="date"
                            value={presetDates[preset.key]}
                            onChange={(e) =>
                              setPresetDates((prev) => ({ ...prev, [preset.key]: e.target.value }))
                            }
                            className="h-8 text-sm"
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => submitPreset(preset.key, preset.title)}
                          disabled={isPending}
                        >
                          {isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                          Add
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-1 border-t border-border pt-3 text-xs font-semibold uppercase text-muted-foreground">
          Add extra service
        </p>
        <div className="flex flex-col gap-2">
          <Input
            placeholder="e.g. Gutter Clean"
            value={serviceTitle}
            onChange={(e) => setServiceTitle(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="£"
              type="number"
              step="0.01"
              value={servicePrice}
              onChange={(e) => setServicePrice(e.target.value)}
              className="h-8 w-20 text-xs"
            />
            <select
              value={serviceInterval}
              onChange={(e) => setServiceInterval(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            >
              <option value="0">One-off</option>
              <option value="1">Weekly</option>
              <option value="2">Fortnightly</option>
              <option value="4">4wk</option>
              <option value="8">8wk</option>
              <option value="12">12wk</option>
            </select>
            <Input
              type="date"
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
              className="h-8 w-auto text-xs"
            />
            <Button size="sm" variant="outline" onClick={submitService} disabled={isPending}>
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
