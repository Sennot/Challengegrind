import type { Role } from "./types";

export const ROLE_RANK: Record<Role, number> = { player: 0, helper: 1, moderator: 2, admin: 3, owner: 4 };

export const ROLE_LABEL: Record<Role, string> = {
  player: "Player",
  helper: "List Helper",
  moderator: "List Moderator",
  admin: "List Admin",
  owner: "Owner",
};

export const ROLE_STYLE: Record<Role, string> = {
  player: "border-line text-muted",
  helper: "border-line text-sky-300",
  moderator: "border-line text-violet-300",
  admin: "border-line text-brand-2",
  owner: "border-brand/40 text-brand",
};
