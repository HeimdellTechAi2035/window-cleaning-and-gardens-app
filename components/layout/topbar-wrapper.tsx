"use client";

import { usePathname } from "next/navigation";
import { Topbar } from "./topbar";
import { navItems } from "./nav-items";

export function TopbarWrapper({
  userName,
  userInitials,
}: {
  userName: string;
  userInitials: string;
}) {
  const pathname = usePathname();
  const current = navItems.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  return <Topbar title={current?.label ?? "Dashboard"} userName={userName} userInitials={userInitials} />;
}
