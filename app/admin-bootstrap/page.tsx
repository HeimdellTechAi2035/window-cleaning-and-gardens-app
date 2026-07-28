import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BootstrapForm } from "@/components/admin/bootstrap-form";
import { ShieldCheck } from "lucide-react";

// No cookies()/headers() usage here (unlike most other pages), so without
// this Next.js would try to prerender it statically at build time — which
// would freeze "already configured" as whatever it happened to be during
// that specific build, rather than checking the database on every request.
export const dynamic = "force-dynamic";

// Deliberately outside /admin (whose own layout redirects anyone without a
// PlatformAdmin session — which would make it impossible to ever create
// the very first one). No login of any kind is required to view this page;
// the real security is the secret + one-time-only check inside
// bootstrapAdminAction, not this route's location or any prior auth.
export default async function AdminBootstrapPage() {
  const existing = await prisma.platformAdmin.findFirst();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 px-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <span className="text-lg font-semibold">RoundFlow Platform Admin</span>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{existing ? "Already configured" : "Set up the platform admin"}</CardTitle>
          <CardDescription>
            {existing
              ? "A platform admin already exists. Ask them to grant you access from within /admin."
              : "Creates a standalone admin login, separate from any company account. This only works once, ever."}
          </CardDescription>
        </CardHeader>
        <CardContent>{!existing && <BootstrapForm />}</CardContent>
      </Card>
    </div>
  );
}
