"use client";

import { useState, useTransition } from "react";
import { Loader2, Check } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateOrganizationAsAdminAction } from "@/app/actions/super-admin";

const STATUSES = ["incomplete", "trialing", "active", "past_due", "canceled", "unpaid"] as const;

export function OrgEditForm({
  organizationId,
  name,
  timezone,
  subscriptionStatus,
}: {
  organizationId: string;
  name: string;
  timezone: string;
  subscriptionStatus: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("organizationId", organizationId);
    setError(null);
    startTransition(async () => {
      const result = await updateOrganizationAsAdminAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="org-name">Business name</Label>
        <Input id="org-name" name="name" defaultValue={name} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="org-timezone">Timezone</Label>
        <Input id="org-timezone" name="timezone" defaultValue={timezone} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="org-subscriptionStatus">Subscription status (manual override)</Label>
        <select
          id="org-subscriptionStatus"
          name="subscriptionStatus"
          defaultValue={subscriptionStatus}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : null}
          {saved ? "Saved" : "Save"}
        </Button>
      </div>
    </form>
  );
}
