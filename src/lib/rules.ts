import { supabase } from "./supabase";
import { RULES } from "../config/site";
import type { ListKind } from "./list";

export type RuleSection = { title: string; items: string[] };

/** Rules of a list from the database; CL falls back to the defaults in config/site.ts until edited, SCL starts empty. */
export async function fetchRules(list: ListKind): Promise<RuleSection[]> {
  const key = list === "scl" ? "rules_scl" : "rules";
  const { data, error } = await supabase.from("site_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.value as RuleSection[] | undefined) ?? (list === "cl" ? RULES : []);
}
