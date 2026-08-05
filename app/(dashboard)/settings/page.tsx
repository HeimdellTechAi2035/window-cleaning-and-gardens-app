import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { initials } from "@/lib/utils";
import { CopyableField } from "@/components/settings/copyable-field";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";
import { DeleteAccountButton } from "@/components/settings/delete-account-button";
import { DeleteOrganizationSection } from "@/components/settings/delete-organization-section";
import { TransferAdminButton } from "@/components/settings/transfer-admin-button";
import {
  updateOrganizationProfileAction,
  updateIntegrationSettingsAction,
  inviteTeamMemberAction,
} from "@/app/actions/organization";
import { formatDate } from "@/lib/utils";

export default async function SettingsPage() {
  const session = await auth();
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: session!.user.organizationId },
  });
  const users = await prisma.user.findMany({
    where: { organizationId: session!.user.organizationId },
    orderBy: { createdAt: "asc" },
  });

  const isAdmin = session!.user.role === "ADMIN";

  const pendingOrgDeletionRequest = isAdmin
    ? await prisma.accountDeletionRequest.findFirst({
        where: {
          organizationId: session!.user.organizationId,
          requestType: "ORGANIZATION",
          status: { in: ["PENDING_VERIFICATION", "VERIFIED", "IN_PROGRESS"] },
        },
        select: { id: true, processingDeadline: true, requestedAt: true },
        orderBy: { requestedAt: "desc" },
      })
    : null;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://greenfixapp.netlify.app";
  const stripeWebhookUrl = `${baseUrl}/api/webhooks/stripe/${organization.id}`;
  const gocardlessWebhookUrl = `${baseUrl}/api/webhooks/gocardless/${organization.id}`;

  const statusLabel: Record<string, string> = {
    trialing: "Free trial",
    active: "Active",
    past_due: "Payment failed",
    canceled: "Canceled",
    unpaid: "Unpaid",
    incomplete: "Not subscribed",
  };
  const statusVariant: Record<string, "success" | "secondary" | "destructive"> = {
    trialing: "secondary",
    active: "success",
    past_due: "destructive",
    canceled: "destructive",
    unpaid: "destructive",
    incomplete: "secondary",
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>Your RoundFlow subscription.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Badge variant={statusVariant[organization.subscriptionStatus] ?? "secondary"} className="w-fit">
              {statusLabel[organization.subscriptionStatus] ?? organization.subscriptionStatus}
            </Badge>
            {organization.subscriptionStatus === "trialing" && organization.trialEndsAt && (
              <p className="text-sm text-muted-foreground">
                Trial ends {formatDate(organization.trialEndsAt)}
              </p>
            )}
            {organization.subscriptionStatus === "active" && organization.currentPeriodEnd && (
              <p className="text-sm text-muted-foreground">
                Renews {formatDate(organization.currentPeriodEnd)}
              </p>
            )}
          </div>
          {isAdmin && organization.platformStripeCustomerId && <ManageBillingButton />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization profile</CardTitle>
          <CardDescription>Your business identity across the app and client portal.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateOrganizationProfileAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Business name</Label>
              <Input id="name" name="name" defaultValue={organization.name} disabled={!isAdmin} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" name="timezone" defaultValue={organization.timezone} disabled={!isAdmin} />
            </div>
            {isAdmin && (
              <div className="sm:col-span-2">
                <Button type="submit" size="sm">
                  Save profile
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Bring your own Stripe and GoCardless accounts so payments from your customers settle
            directly into your own bank account — not shared with any other business on RoundFlow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateIntegrationSettingsAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="text-sm font-semibold">Stripe (card payments)</p>
              <p className="text-xs text-muted-foreground">
                Get your secret key from the Stripe Dashboard → Developers → API keys.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stripeSecretKey">Stripe secret key</Label>
              <Input
                id="stripeSecretKey"
                name="stripeSecretKey"
                type="password"
                placeholder={organization.stripeSecretKey ? "••••••••••••" : "sk_live_..."}
                disabled={!isAdmin}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stripeWebhookSecret">Stripe webhook signing secret</Label>
              <Input
                id="stripeWebhookSecret"
                name="stripeWebhookSecret"
                type="password"
                placeholder={organization.stripeWebhookSecret ? "••••••••••••" : "whsec_..."}
                disabled={!isAdmin}
              />
            </div>
            <CopyableField
              label="Stripe webhook URL — add this in Stripe Dashboard → Developers → Webhooks"
              value={stripeWebhookUrl}
            />

            <div className="sm:col-span-2 border-t border-border pt-4">
              <p className="text-sm font-semibold">GoCardless (Direct Debit)</p>
              <p className="text-xs text-muted-foreground">
                Get your access token from the GoCardless Dashboard → Developers → Access tokens.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gocardlessAccessToken">GoCardless access token</Label>
              <Input
                id="gocardlessAccessToken"
                name="gocardlessAccessToken"
                type="password"
                placeholder={organization.gocardlessAccessToken ? "••••••••••••" : "live_..."}
                disabled={!isAdmin}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gocardlessEnv">GoCardless environment</Label>
              <select
                id="gocardlessEnv"
                name="gocardlessEnv"
                defaultValue={organization.gocardlessEnv}
                disabled={!isAdmin}
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="sandbox">Sandbox</option>
                <option value="live">Live</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gocardlessWebhookSecret">GoCardless webhook secret</Label>
              <Input
                id="gocardlessWebhookSecret"
                name="gocardlessWebhookSecret"
                type="password"
                placeholder={organization.gocardlessWebhookSecret ? "••••••••••••" : "..."}
                disabled={!isAdmin}
              />
            </div>
            <CopyableField
              label="GoCardless webhook URL — add this in GoCardless Dashboard → Developers → Webhook endpoints"
              value={gocardlessWebhookUrl}
            />

            <div className="sm:col-span-2 border-t border-border pt-4">
              <p className="text-sm font-semibold">Notifications</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="resendFromEmail">Notification from email</Label>
              <Input
                id="resendFromEmail"
                name="resendFromEmail"
                placeholder={organization.resendFromEmail ?? "hello@yourbusiness.com"}
                disabled={!isAdmin}
              />
            </div>
            {isAdmin && (
              <div className="sm:col-span-2">
                <Button type="submit" size="sm">
                  Save integrations
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>Admins and operatives with access to this workspace.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {users.map((user) => (
              <div key={user.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {initials(user.name?.split(" ")[0] ?? "?", user.name?.split(" ")[1] ?? "")}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{user.name ?? user.email}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
                  {isAdmin && user.role !== "ADMIN" && user.isActive && (
                    <TransferAdminButton userId={user.id} userName={user.name ?? user.email} />
                  )}
                </div>
              </div>
            ))}
          </div>

          {isAdmin && (
            <form action={inviteTeamMemberAction} className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_1fr_8rem_auto]">
              <Input name="name" placeholder="Full name" required />
              <Input name="email" type="email" placeholder="Email" required />
              <select
                name="role"
                defaultValue="OPERATIVE"
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="OPERATIVE">Operative</option>
                <option value="ADMIN">Admin</option>
              </select>
              <Button type="submit" size="sm">
                Invite
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your account</CardTitle>
          <CardDescription>
            Delete your own RoundFlow login. Your organisation and its other data are not affected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountButton />
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Permanently delete {organization.name} and everything in it. See our{" "}
              <a href="/legal/delete-account" className="underline underline-offset-2">
                account deletion policy
              </a>{" "}
              for full details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteOrganizationSection
              organizationName={organization.name}
              pendingRequest={pendingOrgDeletionRequest}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
