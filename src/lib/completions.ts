import { supabase } from "./supabase";
import { must, useAsync } from "./useAsync";
import { useAuth } from "./auth";

export interface MyCompletions {
  /** levels with an accepted record or verified by the player */
  done: Set<number>;
  /** levels with a record waiting for review */
  pending: Set<number>;
}

const EMPTY: MyCompletions = { done: new Set(), pending: new Set() };

/** Levels the logged-in player has completed / submitted; empty sets for guests */
export function useMyCompletions() {
  const { profile } = useAuth();
  const id = profile?.id;
  const { data, reload } = useAsync(async (): Promise<MyCompletions> => {
    if (!id) return EMPTY;
    const [records, verified] = await Promise.all([
      supabase.from("records").select("level_id, status").eq("player_id", id).neq("status", "rejected"),
      supabase.from("levels").select("id").eq("verifier_id", id),
    ]);
    const rows = must(records) as { level_id: number; status: string }[];
    return {
      done: new Set([...rows.filter((r) => r.status === "approved").map((r) => r.level_id), ...(must(verified) as { id: number }[]).map((l) => l.id)]),
      pending: new Set(rows.filter((r) => r.status === "pending").map((r) => r.level_id)),
    };
  }, [id]);
  return { ...(data ?? EMPTY), reload };
}
