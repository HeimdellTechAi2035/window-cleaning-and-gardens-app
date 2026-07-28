import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { TopbarWrapper } from "@/components/layout/topbar-wrapper";
import { UpdateAvailableBanner } from "@/components/layout/update-available-banner";
import { LegalFooter } from "@/components/layout/legal-footer";
import { initials } from "@/lib/utils";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { name: true, subscriptionStatus: true },
  });

  // Only "trialing" (active free trial) and "active" (paying) organizations
  // get into the app — everyone else (never subscribed, lapsed, canceled)
  // is sent to complete or fix their billing first.
  if (organization && !["trialing", "active"].includes(organization.subscriptionStatus)) {
    redirect("/billing/subscribe");
  }

  const [firstName, lastName = ""] = (session.user.name ?? "User").split(" ");

  return (
    <div className="flex min-h-screen">
      <UpdateAvailableBanner />
      <Sidebar orgName={organization?.name ?? "Workspace"} />
      <div className="flex min-h-screen flex-1 flex-col">
        <TopbarWrapper
          userName={session.user.name ?? session.user.email ?? "User"}
          userInitials={initials(firstName, lastName)}
        />
        <main className="flex-1 px-4 pt-4 md:px-6 lg:px-8">{children}</main>
        <LegalFooter className="pb-24 md:pb-6" />
      </div>
      <BottomNav />
    </div>
  );
}
