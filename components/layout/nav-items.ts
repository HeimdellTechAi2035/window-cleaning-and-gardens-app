import {
  LayoutDashboard,
  CalendarClock,
  Repeat,
  Users,
  Map,
  Wallet,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  mobile?: boolean;
}

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/planner", label: "Day Pilot", icon: CalendarClock, mobile: true },
  { href: "/rounds", label: "Rounds", icon: Repeat, mobile: true },
  { href: "/customers", label: "Customers", icon: Users, mobile: true },
  { href: "/route-map", label: "Route Map", icon: Map, mobile: false },
  { href: "/financials", label: "Financials", icon: Wallet, mobile: true },
  { href: "/settings", label: "Settings", icon: Settings, mobile: false },
];
