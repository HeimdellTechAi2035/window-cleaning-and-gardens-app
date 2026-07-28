import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { OrgEditForm } from "@/components/admin/org-edit-form";
import { UserEditRow } from "@/components/admin/user-edit-row";

const statusVariant: Record<string, "success" | "secondary" | "destructive"> = {
  trialing: "secondary",
  active: "success",
  past_due: "destructive",
  canceled: "destructive",
  unpaid: "destructive",
  incomplete: "secondary",
};

export default async function AdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;

  const organization = await prisma.organization.findUnique({
    where: { id },
    include: {
      users: { orderBy: { createdAt: "asc" } },
      _count: { select: { customers: true, rounds: true } },
    },
  });

  if (!organization) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All organizations
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{organization.name}</h1>
          <p className="text-sm text-muted-foreground">
            {organization._count.customers} customers · {organization._count.rounds} rounds · joined{" "}
            {formatDate(organization.createdAt)}
          </p>
        </div>
        <Badge variant={statusVariant[organization.subscriptionStatus] ?? "secondary"}>
          {organization.subscriptionStatus.replace(/_/g, " ")}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organization details</CardTitle>
          <CardDescription>
            The subscription status dropdown is a manual override — use it to comp a free account,
            extend access for a support issue, or suspend one, independent of what Stripe reports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrgEditForm
            organizationId={organization.id}
            name={organization.name}
            timezone={organization.timezone}
            subscriptionStatus={organization.subscriptionStatus}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Click a user to edit their details or reset their password if they&apos;re locked out.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {organization.users.map((user) => (
            <UserEditRow
              key={user.id}
              user={{
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                isActive: user.isActive,
                isPlatformSuperAdmin: user.isPlatformSuperAdmin,
              }}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
