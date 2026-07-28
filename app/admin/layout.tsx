import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isSuperAdminSession } from "@/lib/super-admin";
import { SignOutLink } from "@/components/layout/sign-out-link";
import { ShieldCheck } from "lucide-react";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isSuperAdminSession(session)) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-5 w-5 text-primary" />
            RoundFlow Platform Admin
          </Link>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{session.user.email}</span>
            <SignOutLink />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
