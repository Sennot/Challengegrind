import { Check } from "lucide-react";
import type { Pack } from "../lib/packs";
import { formatPoints } from "../lib/points";

/** Pill in the pack's color; text stays light so any color is readable */
export function PackBadge({ pack, done, showBonus }: { pack: Pick<Pack, "name" | "color" | "bonus_points">; done?: boolean; showBonus?: boolean }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm text-neutral-100"
      style={{ borderColor: `${pack.color}80`, backgroundColor: `${pack.color}1f` }}
    >
      {done ? <Check className="h-3.5 w-3.5 shrink-0" style={{ color: pack.color }} strokeWidth={3} /> : <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: pack.color }} />}
      <span className="truncate">{pack.name}</span>
      {showBonus && pack.bonus_points > 0 && <span className="shrink-0 text-xs tabular-nums text-neutral-400">+{formatPoints(pack.bonus_points)}</span>}
    </span>
  );
}

/** Round green check for completed levels */
export function DoneCheck({ className = "", title = "Completed" }: { className?: string; title?: string }) {
  return (
    <span title={title} className={`grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.45)] ${className}`}>
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </span>
  );
}
