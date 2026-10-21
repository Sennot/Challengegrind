import { supabase } from "./supabase";
import { must } from "./useAsync";
import type { Level } from "./types";

export type PackLevel = Pick<Level, "id" | "name" | "position">;

export interface Pack {
  id: number;
  name: string;
  /** "#rrggbb" */
  color: string;
  /** extra points for completing every level of the pack (set by List Admin+) */
  bonus_points: number;
  created_at: string;
  updated_at: string;
  /** hardest first */
  levels: PackLevel[];
}

/** Presets offered in the pack editor (any color is allowed) */
export const PACK_COLORS = ["#f27a1a", "#ef4444", "#ec4899", "#a855f7", "#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#84cc16", "#eab308", "#a3a3a3"];

type PackRow = Omit<Pack, "levels"> & { pack_levels: { level: PackLevel | null }[] };

function toPack({ pack_levels, ...p }: PackRow): Pack {
  return {
    ...p,
    bonus_points: Number(p.bonus_points),
    levels: pack_levels.flatMap((pl) => (pl.level ? [pl.level] : [])).sort((a, b) => a.position - b.position),
  };
}

/** All packs with their levels, newest last */
export async function fetchPacks(): Promise<Pack[]> {
  const rows = must(await supabase.from("packs").select("*, pack_levels(level:levels(id, name, position))").order("created_at")) as unknown as PackRow[];
  return rows.map(toPack);
}

/** Packs that contain a level */
export async function fetchLevelPacks(levelId: number): Promise<Pack[]> {
  const ids = (must(await supabase.from("pack_levels").select("pack_id").eq("level_id", levelId)) as { pack_id: number }[]).map((r) => r.pack_id);
  if (!ids.length) return [];
  const rows = must(await supabase.from("packs").select("*, pack_levels(level:levels(id, name, position))").in("id", ids).order("created_at")) as unknown as PackRow[];
  return rows.map(toPack);
}

/** A pack counts as completed when every one of its levels is in `done` (same rule as the leaderboard view) */
export const isPackDone = (p: Pack, done: ReadonlySet<number>) => p.levels.length > 0 && p.levels.every((l) => done.has(l.id));
