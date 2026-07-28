"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { resetUserPasswordAsAdminAction } from "@/app/actions/super-admin";

export function ResetPasswordButton({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const result = await resetUserPasswordAsAdminAction(userId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setTempPassword(result.tempPassword);
    });
  }

  function handleCopy() {
    if (!tempPassword) return;
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setTempPassword(null);
      setError(null);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <KeyRound className="h-3.5 w-3.5" />
        Reset password
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password for {userName}</DialogTitle>
            <DialogDescription>
              {tempPassword
                ? "Shown once — copy it now and relay it to them directly (phone/email outside the app). They should change it after signing in."
                : "Generates a new temporary password. Their old password stops working immediately."}
            </DialogDescription>
          </DialogHeader>

          {tempPassword && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 font-mono text-sm">
              <span className="flex-1">{tempPassword}</span>
              <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{tempPassword ? "Close" : "Cancel"}</Button>
            </DialogClose>
            {!tempPassword && (
              <Button variant="destructive" onClick={handleReset} disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Reset password
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
