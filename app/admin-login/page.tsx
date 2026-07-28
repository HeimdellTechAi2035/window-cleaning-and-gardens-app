import { redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { getAdminSession } from "@/lib/admin-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { ShieldCheck } from "lucide-react";

// Same manifest as /admin so installing from here (or from /admin, after
// signing in) both point at the same standalone, distinctly-branded PWA.
export const metadata: Metadata = {
  title: "RoundFlow Platform Admin",
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "RF Admin",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default async function AdminLoginPage() {
  const session = await getAdminSession();
  if (session) redirect("/admin");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 px-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <span className="text-lg font-semibold">RoundFlow Platform Admin</span>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>This is a separate login from any company account.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminLoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
