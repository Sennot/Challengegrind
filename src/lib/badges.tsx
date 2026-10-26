import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

interface Badges {
  /** unread notifications of the logged-in player */
  unread: number;
  /** records waiting for review (List Helper+) */
  pendingRecords: number;
  /** level submissions waiting for review (List Moderator+) */
  pendingLevels: number;
  /** re-count now, e.g. right after reviewing something */
  refresh: () => void;
}

const BadgesContext = createContext<Badges>({ unread: 0, pendingRecords: 0, pendingLevels: 0, refresh: () => {} });

const POLL_MS = 30_000;

async function count(query: PromiseLike<{ count: number | null; error: unknown }>) {
  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}

/** Red-dot counters for the header, sidebar and admin tabs; polled while the tab is visible */
export function BadgesProvider({ children }: { children: ReactNode }) {
  const { profile, rank } = useAuth();
  const { pathname } = useLocation();
  const [state, setState] = useState({ unread: 0, pendingRecords: 0, pendingLevels: 0 });
  const id = profile?.id;

  const refresh = useCallback(async () => {
    if (!id) return setState({ unread: 0, pendingRecords: 0, pendingLevels: 0 });
    const [unread, pendingRecords, pendingLevels] = await Promise.all([
      count(supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)),
      rank >= 1 ? count(supabase.from("records").select("id", { count: "exact", head: true }).eq("status", "pending")) : 0,
      rank >= 2 ? count(supabase.from("level_submissions").select("id", { count: "exact", head: true }).eq("status", "pending")) : 0,
    ]);
    setState({ unread, pendingRecords, pendingLevels });
  }, [id, rank]);

  // on login/role change and on every page change
  useEffect(() => {
    void refresh();
  }, [refresh, pathname]);

  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && void refresh();
    const t = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  const value = useMemo(() => ({ ...state, refresh: () => void refresh() }), [state, refresh]);
  return <BadgesContext.Provider value={value}>{children}</BadgesContext.Provider>;
}

export const useBadges = () => useContext(BadgesContext);

/** Red pill with a white number ("99+" above 99); nothing for 0 */
export function CountBadge({ n, className = "" }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span className={`grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[11px] font-semibold leading-none tabular-nums text-white ${className}`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}
