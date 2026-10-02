import { History, ListOrdered, ScrollText, Send, Shield, Trophy, Users, Link2, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  minRank?: number;
}

export const NAV_MAIN: NavItem[] = [
  { to: "/", label: "Список", icon: ListOrdered },
  { to: "/stats", label: "Stats Viewer", icon: Trophy },
  { to: "/changelog", label: "Changelog", icon: History },
  { to: "/submit", label: "Отправить рекорд", icon: Send },
];

export const NAV_INFO: NavItem[] = [
  { to: "/rules", label: "Правила", icon: ScrollText },
  { to: "/team", label: "Команда", icon: Users },
  { to: "/socials", label: "Соцсети", icon: Link2 },
];

export const NAV_ADMIN: NavItem = { to: "/admin", label: "Админ-панель", icon: Shield, minRank: 1 };
