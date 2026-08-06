"use client";

import { useState, useTransition } from "react";
import { Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createReviewerAccountAction,
  regenerateReviewerPasswordAction,
  resetReviewerDemoDataAction,
  disableReviewerAccessAction,
} from "@/app/actions/reviewer-access";

const REVIEWER_EMAIL = "googleplay-review@heimdell-tech-ai.co.uk";

interface Status {
  exists: boolean;
  organizationName: string | null;
  isActive: boolean | null;
  subscriptionStatus: string | null;
  reviewerDemoDataResetAt: string | null;
  demoRecordCount: number;
}

type ActionResult = { ok: true; tempPassword?: string } | { error: string };

export function GooglePlayReviewerPanel({ status }: { status: Status }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Held only in memory for this render — never written to localStorage,
  // never put in a URL, never logged. Cleared for good the moment the user
  // dismisses it or navigates away.
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [copied, setCopied] = useState(false);

  function runAction(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if ("tempPassword" in result && result.tempPassword) {
        setRevealedPassword(result.tempPassword);
      }
      setConfirmingReset(false);
      setConfirmingDisable(false);
    });
  }

  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "";

  const accessOutputText = revealedPassword
    ? [
        "ROUND FLOW GOOGLE PLAY REVIEWER ACCESS",
        "",
        "Login URL:",
        loginUrl,
        "",
        "Email:",
        REVIEWER_EMAIL,
        "",
        "Password:",
        revealedPassword,
        "",
        "Instructions:",
        "This account provides administrator access to a fictional demonstration organisation. No payment, email verification, OTP or additional approval is required. The account contains fictional customers, properties, jobs, routes, workers and financial records so all major RoundFlow features can be reviewed immediately.",
        "",
        "Available areas:",
        "- Dashboard",
        "- Planner",
        "- Rounds",
        "- Customers",
        "- Route Map",
        "- Financials",
        "- Settings",
        "- Job completion",
        "- Photo upload workflow",
        "",
        "No genuine customer or GreenFix data is included.",
      ].join("\n")
    : "";

  async function handleCopy() {
    await navigator.clipboard.writeText(accessOutputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (revealedPassword) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Save this now — it cannot be recovered once you leave this screen.
        </p>
        <pre className="whitespace-pre-wrap rounded-md border border-border bg-background p-3 font-mono text-xs">
          {accessOutputText}
        </pre>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy Play Console App Access text"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setRevealedPassword(null)}>
            I&apos;ve saved it — hide password
          </Button>
        </div>
        <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
          Only this password&apos;s hash is stored — the plaintext above exists only in this browser tab&apos;s
          memory right now. Use &quot;Regenerate password&quot; below any time you need a new one.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-muted-foreground">Reviewer email</p>
          <p className="font-medium">{REVIEWER_EMAIL}</p>
        </div>
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-muted-foreground">Organisation</p>
          <p className="font-medium">{status.organizationName ?? "Not created yet"}</p>
        </div>
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-muted-foreground">Reviewer account status</p>
          <p className="font-medium">
            {!status.exists ? "Not created" : status.isActive ? "Active — can sign in" : "Disabled — cannot sign in"}
          </p>
        </div>
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-muted-foreground">Subscription / access status</p>
          <p className="font-medium">{status.subscriptionStatus ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-muted-foreground">Last demo data reset</p>
          <p className="font-medium">
            {status.reviewerDemoDataResetAt ? new Date(status.reviewerDemoDataResetAt).toLocaleString("en-GB") : "Never"}
          </p>
        </div>
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-muted-foreground">Fictional demo records</p>
          <p className="font-medium">{status.demoRecordCount}</p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={isPending} onClick={() => runAction(createReviewerAccountAction)}>
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {status.exists ? "Re-create / repair reviewer account" : "Create reviewer account"}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending || !status.exists}
          onClick={() => runAction(regenerateReviewerPasswordAction)}
        >
          Regenerate password
        </Button>

        {confirmingReset ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-2 py-1.5">
            <span className="text-xs text-destructive">Wipe and regenerate all fictional demo data?</span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={isPending}
              onClick={() => runAction(resetReviewerDemoDataAction)}
            >
              Confirm reset
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirmingReset(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending || !status.exists}
            onClick={() => setConfirmingReset(true)}
          >
            Reset demo data
          </Button>
        )}

        {confirmingDisable ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-2 py-1.5">
            <span className="text-xs text-destructive">Block this account from signing in?</span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={isPending}
              onClick={() => runAction(disableReviewerAccessAction)}
            >
              Confirm disable
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirmingDisable(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={isPending || !status.exists}
            onClick={() => setConfirmingDisable(true)}
          >
            Disable reviewer access
          </Button>
        )}
      </div>
    </div>
  );
}
