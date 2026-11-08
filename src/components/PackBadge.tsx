import { Check } from "lucide-react";
import type { Pack } from "../lib/packs";
import { formatBonus } from "../lib/points";

/** Pack tag: the pack color is only a dot */
export function PackBadge({ pack, done, showBonus }: { pack: Pick<Pack, "name" | "color" | "bonus_points">; done?: boolean; showBonus?: boolean }) {
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 text-sm text-neutral-100">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: pack.color }} />
      <span className="truncate">{pack.name}</span>
      {done && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={2.5} />}
      {showBonus && pack.bonus_points > 0 && <span className="num shrink-0 text-xs text-neutral-500">{formatBonus(pack.bonus_points)}</span>}
    </span>
  );
}

/** Round green check for completed levels */
export function DoneCheck({ className = "", title = "Completed" }: { className?: string; title?: string }) {
  return (
    <span title={title} className={`grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-black ${className}`}>
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </span>
  );
}
