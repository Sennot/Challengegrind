import { supabase } from "./supabase";
import { RULES } from "../config/site";

export type RuleSection = { title: string; items: string[] };

/** Rules from the database; falls back to the defaults in config/site.ts until edited. */
export async function fetchRules(): Promise<RuleSection[]> {
  const { data, error } = await supabase.from("site_settings").select("value").eq("key", "rules").maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.value as RuleSection[] | undefined) ?? RULES;
}
