"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { Trash2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { requestUserDeletionAction } from "@/app/actions/account-deletion";

export function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleSubmit() {
    if (!password) {
      setError("Enter your password to confirm.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("password", password);
      const result = await requestUserDeletionAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDone(true);
      // Sessions are already revoked server-side; sign this browser out
      // immediately too rather than leaving the current tab logged in
      // until its token naturally expires.
      setTimeout(() => signOut({ callbackUrl: "/login" }), 1500);
    });
  }

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    setOpen(next);
    if (!next) {
      setPassword("");
      setError(null);
      setDone(false);
    }
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-3.5 w-3.5" />
        Delete my account
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your RoundFlow account</DialogTitle>
            <DialogDescription>
              {done
                ? "Your account has been deleted. Signing you out…"
                : "This removes your name, email, phone number, and login from RoundFlow, and signs you out everywhere immediately. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>

          {!done && (
            <>
              <ul className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                <li>• Your name, email, and phone number are permanently cleared</li>
                <li>• Your login password is removed — you will not be able to sign back in</li>
                <li>• Your sessions are revoked immediately</li>
                <li>
                  • Jobs you previously worked on stay with the organisation for its records, but show
                  &quot;Former user&quot; instead of your name
                </li>
                <li>• Your organisation&apos;s customers, jobs, and other data are not affected</li>
              </ul>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="delete-account-password">Confirm your password</Label>
                <Input
                  id="delete-account-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          )}

          <DialogFooter>
            {!done && (
              <>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button variant="destructive" onClick={handleSubmit} disabled={isPending}>
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Permanently delete my account
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
