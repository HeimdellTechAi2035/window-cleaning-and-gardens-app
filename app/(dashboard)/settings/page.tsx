import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { initials } from "@/lib/utils";
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
            API credentials for GoCardless, Stripe, Mapbox, and notifications. Stored per-organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateIntegrationSettingsAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gocardlessAccessToken">GoCardless access token</Label>
              <Input
                id="gocardlessAccessToken"
                name="gocardlessAccessToken"
                type="password"
                placeholder={organization.gocardlessAccessToken ? "••••••••••••" : "sandbox_..."}
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
              <Label htmlFor="stripeAccountId">Stripe account ID</Label>
              <Input
                id="stripeAccountId"
                name="stripeAccountId"
                placeholder={organization.stripeAccountId ?? "acct_..."}
                disabled={!isAdmin}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mapboxToken">Mapbox access token</Label>
              <Input
                id="mapboxToken"
                name="mapboxToken"
                type="password"
                placeholder={organization.mapboxToken ? "••••••••••••" : "pk.eyJ..."}
                disabled={!isAdmin}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="twilioFromNumber">Twilio SMS from number</Label>
              <Input
                id="twilioFromNumber"
                name="twilioFromNumber"
                placeholder={organization.twilioFromNumber ?? "+441234567890"}
                disabled={!isAdmin}
              />
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
