import type { Role } from "./types";

export const ROLE_RANK: Record<Role, number> = { player: 0, helper: 1, moderator: 2, admin: 3, owner: 4 };

export const ROLE_LABEL: Record<Role, string> = {
  player: "Player",
  helper: "List Helper",
  moderator: "List Moderator",
  admin: "List Admin",
  owner: "Owner",
};

/** Quiet text tags; only the owner carries the accent */
export const ROLE_STYLE: Record<Role, string> = {
  player: "border-line text-muted",
  helper: "border-line text-neutral-400",
  moderator: "border-line text-neutral-300",
  admin: "border-line text-white",
  owner: "border-brand/40 text-brand",
};
