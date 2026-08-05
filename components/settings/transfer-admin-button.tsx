"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { transferAdminRoleAction } from "@/app/actions/account-deletion";

export function TransferAdminButton({ userId, userName }: { userId: string; userName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!confirm(`Make ${userName} an admin of this organisation?`)) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("userId", userId);
      const result = await transferAdminRoleAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldPlus className="h-3.5 w-3.5" />}
        Make admin
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
