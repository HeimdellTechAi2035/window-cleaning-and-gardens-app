import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BootstrapForm } from "@/components/admin/bootstrap-form";
import { ShieldCheck } from "lucide-react";

// Deliberately outside /admin (whose own layout redirects anyone who isn't
// already a super-admin — which would make it impossible to ever grant
// the very first one). Real security here is the secret + one-time-only
// check inside bootstrapSuperAdminAction, not this route's location.
export default async function AdminBootstrapPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const existingSuperAdmin = await prisma.user.findFirst({ where: { isPlatformSuperAdmin: true } });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 px-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <span className="text-lg font-semibold">RoundFlow Platform Admin</span>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{existingSuperAdmin ? "Already configured" : "Bootstrap super-admin"}</CardTitle>
          <CardDescription>
            {existingSuperAdmin
              ? "A platform super-admin already exists. Ask them to grant you access from within /admin."
              : `This will make ${session.user.email} the platform super-admin. This only works once, ever.`}
          </CardDescription>
        </CardHeader>
        <CardContent>{!existingSuperAdmin && <BootstrapForm />}</CardContent>
      </Card>
    </div>
  );
}
