"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { bootstrapSuperAdminAction } from "@/app/actions/super-admin-bootstrap";

export function BootstrapForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await bootstrapSuperAdminAction(formData);
      if (result && "error" in result) {
        setError(result.error);
      }
      // On success the action itself redirects to /admin — nothing to do here.
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="secret">Bootstrap secret</Label>
        <Input id="secret" name="secret" type="password" required autoFocus />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Make me the platform super-admin
      </Button>
    </form>
  );
}
