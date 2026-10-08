import { useLocation } from "react-router";

/** Challenge List (CL) or Spam Challenge List (SCL); SCL pages live under /scl */
export type ListKind = "cl" | "scl";

export const LIST_TITLE: Record<ListKind, string> = { cl: "Challenge list", scl: "Spam Challenge List" };

/** Suggestions for the click method of spam challenges (free text is allowed) */
export const METHODS = ["Alternating", "Butterfly", "Jitter", "Drag click", "Single hand"];

/** "240" → "240 FPS", "CBF" stays as is */
export const fpsLabel = (fps: string) => (/^\d+$/.test(fps) ? `${fps} FPS` : fps);

export const listOf = (pathname: string): ListKind => (pathname === "/scl" || pathname.startsWith("/scl/") ? "scl" : "cl");

/** "/stats" → "/scl/stats" on the SCL */
export const listPath = (list: ListKind, path: string) => (list === "cl" ? path : path === "/" ? "/scl" : `/scl${path}`);

/** Same page in the other list (falls back to its main page where the page is list-specific, e.g. a level) */
export function switchPath(pathname: string, to: ListKind) {
  const bare = listOf(pathname) === "scl" ? pathname.slice(4) || "/" : pathname;
  return listPath(to, bare.startsWith("/level/") ? "/" : bare);
}

export function useList() {
  const list = listOf(useLocation().pathname);
  return { list, isScl: list === "scl", path: (p: string) => listPath(list, p) };
}
