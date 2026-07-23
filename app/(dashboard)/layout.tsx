import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { TopbarWrapper } from "@/components/layout/topbar-wrapper";
import { initials } from "@/lib/utils";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { name: true },
  });

  const [firstName, lastName = ""] = (session.user.name ?? "User").split(" ");

  return (
    <div className="flex min-h-screen">
      <Sidebar orgName={organization?.name ?? "Workspace"} />
      <div className="flex min-h-screen flex-1 flex-col">
        <TopbarWrapper
          userName={session.user.name ?? session.user.email ?? "User"}
          userInitials={initials(firstName, lastName)}
        />
        <main className="flex-1 px-4 pb-24 pt-4 md:px-6 md:pb-8 lg:px-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
