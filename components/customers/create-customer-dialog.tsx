"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { servicePresets as serviceOptions } from "@/lib/service-presets";
import { createCustomerAction } from "@/app/actions/customers";

const paymentMethods = [
  { value: "DIRECT_DEBIT", label: "Direct Debit" },
  { value: "CARD", label: "Card (Stripe)" },
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
] as const;

export function CreateCustomerDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [city, setCity] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<(typeof paymentMethods)[number]["value"]>("CASH");
  const [enabledServices, setEnabledServices] = useState<Record<string, boolean>>({});
  const [servicePrices, setServicePrices] = useState<Record<string, string>>(
    Object.fromEntries(serviceOptions.map((s) => [s.key, s.defaultPrice]))
  );
  const [serviceIntervals, setServiceIntervals] = useState<Record<string, string>>(
    Object.fromEntries(serviceOptions.map((s) => [s.key, s.defaultIntervalWeeks]))
  );
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function toggleService(key: string) {
    setEnabledServices((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSubmit(formData: FormData) {
    formData.set("preferredPaymentMethod", paymentMethod);
    formData.set("startDate", startDate);

    const services = serviceOptions
      .filter((s) => enabledServices[s.key])
      .map((s) => ({
        title: s.title,
        price: Number(servicePrices[s.key]),
        defaultIntervalWeeks: Number(serviceIntervals[s.key]),
      }))
      .filter((s) => s.price > 0);
    formData.set("services", JSON.stringify(services));

    setSubmitError(null);
    startTransition(async () => {
      try {
        const result = await createCustomerAction(formData);
        setOpen(false);
        formRef.current?.reset();
        setEnabledServices({});
        setCity("");
        router.push(`/customers/${result.customerId}`);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Failed to add customer");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          New customer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add customer</DialogTitle>
          <DialogDescription>Creates the customer and their first property.</DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={handleSubmit} className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" name="firstName" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" name="lastName" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" type="tel" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addressLine1">Property address</Label>
            <Input id="addressLine1" name="addressLine1" required placeholder="12 Orchard Road" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="city">City / area</Label>
              <Input
                id="city"
                name="city"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="postcode">Postcode</Label>
              <Input id="postcode" name="postcode" required />
            </div>
          </div>
          {city.trim() && (
            <p className="-mt-2 text-xs text-muted-foreground">
              Will be auto-added to the &quot;{city.trim()}&quot; round, alongside every other
              customer in that area.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Services</Label>
              <div className="flex items-center gap-2">
                <Label htmlFor="startDate" className="text-xs text-muted-foreground">
                  First visit
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-8 w-auto text-sm"
                />
              </div>
            </div>
            {serviceOptions.map((s) => {
              const Icon = s.icon;
              const isEnabled = !!enabledServices[s.key];
              return (
                <div
                  key={s.key}
                  className={cn(
                    "rounded-lg border transition-colors",
                    isEnabled ? "border-primary/40 bg-primary/5" : "border-border"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleService(s.key)}
                    className="flex w-full items-center justify-between px-3 py-2.5"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Icon className={cn("h-4 w-4", isEnabled ? "text-primary" : "text-muted-foreground")} />
                      {s.title}
                    </span>
                    <span
                      className={cn(
                        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                        isEnabled ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                          isEnabled ? "translate-x-5" : "translate-x-0.5"
                        )}
                      />
                    </span>
                  </button>
                  {isEnabled && (
                    <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Price (£)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={servicePrices[s.key]}
                          onChange={(e) =>
                            setServicePrices((prev) => ({ ...prev, [s.key]: e.target.value }))
                          }
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Repeat every</Label>
                        <select
                          value={serviceIntervals[s.key]}
                          onChange={(e) =>
                            setServiceIntervals((prev) => ({ ...prev, [s.key]: e.target.value }))
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
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Preferred payment method</Label>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setPaymentMethod(m.value)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm transition-colors",
                    paymentMethod === m.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {paymentMethod === "CARD" && (
              <p className="text-xs text-muted-foreground">
                You&apos;ll be able to send a Stripe payment link or collect a card on file from
                their customer page after saving.
              </p>
            )}
          </div>

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Add customer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
