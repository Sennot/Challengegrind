import { useMemo, useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { Check, ChevronDown, Package, Search, Sparkles } from "lucide-react";
import { useAsync } from "../lib/useAsync";
import { useAuth } from "../lib/auth";
import { fetchPacks, isPackDone, type Pack } from "../lib/packs";
import { useMyCompletions } from "../lib/completions";
import { formatPoints, levelPoints } from "../lib/points";
import { Empty, ErrorBox, PageHeader, Spinner } from "../components/ui";

type Filter = "all" | "done" | "progress" | "todo";
type Sort = "hardest" | "bonus" | "newest";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "done", label: "Completed" },
  { id: "progress", label: "In progress" },
  { id: "todo", label: "Not started" },
];

/** Levels shown before "Show all" on a card */
const PREVIEW = 6;

const stateOf = (p: Pack, done: ReadonlySet<number>): Filter =>
  isPackDone(p, done) ? "done" : p.levels.some((l) => done.has(l.id)) ? "progress" : "todo";

export default function PacksPage() {
  const { data, loading, error } = useAsync(fetchPacks, []);
  const { profile } = useAuth();
  const { done } = useMyCompletions();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("hardest");

  const packs = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = (data ?? []).filter(
      (p) => (!s || p.name.toLowerCase().includes(s) || p.levels.some((l) => l.name.toLowerCase().includes(s))) && (filter === "all" || stateOf(p, done) === filter),
    );
    const hardest = (p: Pack) => p.levels[0]?.position ?? Infinity;
    return [...list].sort((a, b) =>
      sort === "bonus" ? b.bonus_points - a.bonus_points || hardest(a) - hardest(b) : sort === "newest" ? b.created_at.localeCompare(a.created_at) : hardest(a) - hardest(b),
    );
  }, [data, q, filter, sort, done]);

  const completed = (data ?? []).filter((p) => isPackDone(p, done));
  const earned = completed.reduce((sum, p) => sum + p.bonus_points, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Packs" subtitle="Beat every level of a pack to earn its bonus points." />

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : !data?.length ? (
        <Empty icon={<Package />}>No packs yet</Empty>
      ) : (
        <>
          {profile && (
            <div className="card mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/15 text-brand">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-xs text-muted">Your packs</div>
                  <div className="font-semibold tabular-nums text-white">
                    {completed.length} <span className="font-normal text-muted">/ {data.length} completed</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">Bonus earned</div>
                <div className="font-semibold tabular-nums text-white">+{formatPoints(earned)} pts</div>
              </div>
              <div className="h-2 min-w-40 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${(completed.length / data.length) * 100}%` }} />
              </div>
            </div>
          )}

          <div className="mb-4 flex flex-col gap-2.5 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="input pl-9" placeholder="Find a pack or level" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="input sm:w-44" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort packs">
              <option value="hardest">Hardest first</option>
              <option value="bonus">Biggest bonus</option>
              <option value="newest">Newest</option>
            </select>
          </div>

          {profile && (
            <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              {FILTERS.map((f) => {
                const n = f.id === "all" ? data.length : data.filter((p) => stateOf(p, done) === f.id).length;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      filter === f.id ? "border-brand/50 bg-brand/10 text-white" : "border-line text-muted hover:text-white"
                    }`}
                  >
                    {f.label}
                    <span className="tabular-nums text-xs text-muted">{n}</span>
                  </button>
                );
              })}
            </div>
          )}

          {packs.length === 0 ? (
            <Empty icon={<Package />}>Nothing found</Empty>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {packs.map((p, i) => (
                <PackCard key={p.id} pack={p} done={done} showProgress={Boolean(profile)} index={i} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PackCard({ pack, done, showProgress, index }: { pack: Pack; done: ReadonlySet<number>; showProgress: boolean; index: number }) {
  const [open, setOpen] = useState(false);
  const have = pack.levels.filter((l) => done.has(l.id)).length;
  const complete = isPackDone(pack, done);
  const total = pack.levels.length;
  const shown = open ? pack.levels : pack.levels.slice(0, PREVIEW);
  const c = pack.color;

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03 }}
      className="relative flex flex-col overflow-hidden rounded-xl border bg-surface"
      style={{ borderColor: complete ? `${c}99` : `${c}40`, boxShadow: complete ? `0 0 24px -8px ${c}80` : undefined }}
    >
      {/* Colored header */}
      <div className="relative px-4 pb-3 pt-4" style={{ background: `linear-gradient(135deg, ${c}33 0%, ${c}0d 55%, transparent 100%)` }}>
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${c}26`, color: c }}>
            <Package className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold leading-tight text-white">{pack.name}</h2>
            <p className="mt-0.5 text-xs text-muted">
              {total} level{total === 1 ? "" : "s"}
              {total > 0 && <> · hardest #{pack.levels[0].position}</>}
            </p>
          </div>
          {pack.bonus_points > 0 && (
            <div className="shrink-0 text-right">
              <div className="text-lg font-semibold tabular-nums leading-tight" style={{ color: c }}>
                +{formatPoints(pack.bonus_points)}
              </div>
              <div className="text-[11px] text-muted">bonus pts</div>
            </div>
          )}
        </div>

        {showProgress && (
          <div className="mt-3 flex items-center gap-2.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/40">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${total ? (have / total) * 100 : 0}%`, backgroundColor: c }} />
            </div>
            {complete ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
                <Check className="h-3.5 w-3.5" strokeWidth={3} /> Completed
              </span>
            ) : (
              <span className="text-xs tabular-nums text-muted">
                {have}/{total}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Levels */}
      <ul className="flex-1 divide-y divide-line border-t border-line">
        {shown.map((l) => {
          const got = done.has(l.id);
          return (
            <li key={l.id}>
              <Link to={`/level/${l.id}`} className="flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-surface-2">
                <span className="w-9 shrink-0 tabular-nums text-muted">#{l.position}</span>
                <span className={`min-w-0 flex-1 truncate ${got ? "text-white" : "text-neutral-300"}`}>{l.name}</span>
                <span className="hidden shrink-0 text-xs tabular-nums text-neutral-500 sm:inline">{formatPoints(levelPoints(l.position))}</span>
                {got ? (
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-black" title="Completed">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                ) : (
                  showProgress && <span className="h-5 w-5 shrink-0 rounded-full border border-neutral-700" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {total > PREVIEW && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center justify-center gap-1.5 border-t border-line py-2 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-white"
        >
          {open ? "Show less" : `Show all ${total} levels`}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    </motion.article>
  );
}
