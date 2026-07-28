import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Building2 } from "lucide-react";

const statusVariant: Record<string, "success" | "secondary" | "destructive"> = {
  trialing: "secondary",
  active: "success",
  past_due: "destructive",
  canceled: "destructive",
  unpaid: "destructive",
  incomplete: "secondary",
};

export default async function AdminOrganizationsPage() {
  await requireSuperAdmin();

  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { users: true, customers: true } },
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Organizations</h1>
        <p className="text-sm text-muted-foreground">{organizations.length} companies signed up</p>
      </div>

      <div className="flex flex-col gap-2">
        {organizations.map((org) => (
          <Link key={org.id} href={`/admin/organizations/${org.id}`}>
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{org.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {org._count.users} user{org._count.users === 1 ? "" : "s"} ·{" "}
                      {org._count.customers} customer{org._count.customers === 1 ? "" : "s"} · joined{" "}
                      {formatDate(org.createdAt)}
                    </p>
                  </div>
                </div>
                <Badge variant={statusVariant[org.subscriptionStatus] ?? "secondary"}>
                  {org.subscriptionStatus.replace(/_/g, " ")}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
