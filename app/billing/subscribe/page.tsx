import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlanDetails } from "@/lib/platform-billing";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SubscribeButton } from "@/components/billing/subscribe-button";
import { SignOutLink } from "@/components/layout/sign-out-link";
import { Droplets, Check } from "lucide-react";

export default async function SubscribePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: session.user.organizationId },
  });

  // Already subscribed (or grandfathered in) — nothing to do here.
  if (organization.subscriptionStatus === "trialing" || organization.subscriptionStatus === "active") {
    redirect("/dashboard");
  }

  const isAdmin = session.user.role === "ADMIN";
  const lapsed = organization.subscriptionStatus === "past_due" || organization.subscriptionStatus === "canceled";

  let plan: { amount: number; currency: string; interval: string } | null = null;
  let planError: string | null = null;
  try {
    plan = await getPlanDetails();
  } catch {
    planError = "Billing isn't fully set up yet — please contact support.";
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-muted/40 px-4 py-10">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Droplets className="h-5 w-5" />
        </div>
        <span className="text-lg font-semibold">RoundFlow</span>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{lapsed ? "Your subscription has lapsed" : "Start your free trial"}</CardTitle>
          <CardDescription>
            {lapsed
              ? "Resubscribe to regain access to your workspace."
              : "14 days free, full access. Card required, no charge until your trial ends."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {plan && (
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-3xl font-semibold">
                £{plan.amount.toFixed(2)}
                <span className="text-sm font-normal text-muted-foreground">/{plan.interval}</span>
              </p>
              <ul className="mt-3 flex flex-col gap-1.5 text-left text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-success" /> Unlimited customers & rounds
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-success" /> Route map, planner, and payments
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-success" /> Your own Stripe/GoCardless accounts
                </li>
              </ul>
            </div>
          )}

          {planError && <p className="text-center text-sm text-destructive">{planError}</p>}

          {isAdmin ? (
            !planError && <SubscribeButton />
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Ask your workspace admin to complete billing setup to unlock the app.
            </p>
          )}

          <SignOutLink className="text-center text-sm text-muted-foreground hover:text-foreground" />
        </CardContent>
      </Card>
    </div>
  );
}
