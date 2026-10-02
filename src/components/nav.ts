import { History, ListOrdered, ScrollText, Send, Shield, Trophy, Users, Link2, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  minRank?: number;
}

export const NAV_MAIN: NavItem[] = [
  { to: "/", label: "List", icon: ListOrdered },
  { to: "/stats", label: "Stats Viewer", icon: Trophy },
  { to: "/changelog", label: "Changelog", icon: History },
  { to: "/submit", label: "Submit record", icon: Send },
];

export const NAV_INFO: NavItem[] = [
  { to: "/rules", label: "Rules", icon: ScrollText },
  { to: "/team", label: "Team", icon: Users },
  { to: "/socials", label: "Socials", icon: Link2 },
];

export const NAV_ADMIN: NavItem = { to: "/admin", label: "Admin panel", icon: Shield, minRank: 1 };
