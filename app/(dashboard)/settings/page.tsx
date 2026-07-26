import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { initials } from "@/lib/utils";
import { CopyableField } from "@/components/settings/copyable-field";
import {
  updateOrganizationProfileAction,
  updateIntegrationSettingsAction,
  inviteTeamMemberAction,
} from "@/app/actions/organization";

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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://greenfixapp.netlify.app";
  const stripeWebhookUrl = `${baseUrl}/api/webhooks/stripe/${organization.id}`;
  const gocardlessWebhookUrl = `${baseUrl}/api/webhooks/gocardless/${organization.id}`;

  return (
    <div className="flex flex-col gap-6">
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
                <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
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
    </div>
  );
}
