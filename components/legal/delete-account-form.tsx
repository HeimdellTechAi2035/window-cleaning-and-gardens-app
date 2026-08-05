"use client";

import { useState, useTransition } from "react";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { submitPublicDeletionRequestAction } from "@/app/actions/public-deletion";

export function DeleteAccountForm() {
  const [requestType, setRequestType] = useState<"USER" | "ORGANIZATION">("USER");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await submitPublicDeletionRequestAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMessage(result.message);
      e.currentTarget.reset();
      setRequestType("USER");
    });
  }

  if (message) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm not-prose">
        {message}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="not-prose flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="da-email">Account email address</Label>
        <Input id="da-email" name="email" type="email" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>What would you like deleted?</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setRequestType("USER")}
            className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
              requestType === "USER" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"
            }`}
          >
            <span className="font-medium">Just my own account</span>
            <p className="text-xs text-muted-foreground">
              Removes your personal login. Your organisation keeps working for its other staff.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setRequestType("ORGANIZATION")}
            className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
              requestType === "ORGANIZATION"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-accent"
            }`}
          >
            <span className="font-medium">My whole organisation</span>
            <p className="text-xs text-muted-foreground">
              Removes the business account and all of its data. Only an administrator can request this.
            </p>
          </button>
        </div>
        <input type="hidden" name="requestType" value={requestType} />
      </div>

      {requestType === "ORGANIZATION" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="da-org">Organisation name</Label>
          <Input id="da-org" name="organizationName" required={requestType === "ORGANIZATION"} />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="da-explanation">Anything else we should know? (optional)</Label>
        <Textarea id="da-explanation" name="explanation" rows={3} />
      </div>

      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="confirmed" required className="mt-0.5 h-4 w-4" />
        I understand this will permanently delete the requested data once verified and processed, and
        that this cannot be undone.
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Submit deletion request
      </Button>
    </form>
  );
}
