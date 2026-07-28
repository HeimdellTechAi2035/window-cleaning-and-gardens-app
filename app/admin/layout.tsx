import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata, Viewport } from "next";
import { getAdminSession } from "@/lib/admin-auth";
import { adminSignOutAction } from "@/app/actions/admin-auth";
import { PushSubscribeButton } from "@/components/admin/push-subscribe-button";
import { LogOut, ShieldCheck } from "lucide-react";

// Distinct from the root layout's metadata so installing this page (once
// signed in) creates a home-screen icon labelled and coloured differently
// from the main RoundFlow app.
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

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin-login");

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin" className="flex shrink-0 items-center gap-2 font-semibold">
            <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
            <span className="sm:hidden">Admin</span>
            <span className="hidden sm:inline">RoundFlow Platform Admin</span>
          </Link>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <PushSubscribeButton />
            <span className="hidden max-w-[12rem] truncate sm:inline">{session.email}</span>
            <form action={adminSignOutAction}>
              <button type="submit" className="flex items-center gap-1.5 underline underline-offset-2">
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
