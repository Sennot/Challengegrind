import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Check, ChevronDown, Package, Search } from "lucide-react";
import { useAsync } from "../lib/useAsync";
import { useAuth } from "../lib/auth";
import { fetchPacks, isPackDone, type Pack } from "../lib/packs";
import { useMyCompletions } from "../lib/completions";
import { formatBonus, formatPoints, levelPoints } from "../lib/points";
import { Empty, ErrorBox, PageHeader, Progress, Spinner } from "../components/ui";

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
    <div className="max-w-5xl">
      <PageHeader title="Packs" subtitle="Beat every level of a pack to earn its bonus points" />

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : !data?.length ? (
        <Empty icon={<Package />}>No packs yet</Empty>
      ) : (
        <>
          {profile && (
            <div className="card mb-6 grid gap-6 p-5 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-end sm:gap-10">
              <div>
                <div className="text-xs text-neutral-500">Your packs</div>
                <div className="num mt-1 text-2xl text-white">
                  {completed.length}
                  <span className="text-base text-neutral-500">/{data.length}</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-500">Bonus earned</div>
                <div className="num mt-1 text-2xl text-white">{formatBonus(earned)}</div>
              </div>
              <Progress value={completed.length} total={data.length} />
            </div>
          )}

          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
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
            <div className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              {FILTERS.map((f) => {
                const n = f.id === "all" ? data.length : data.filter((p) => stateOf(p, done) === f.id).length;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition-colors ${
                      filter === f.id ? "bg-surface-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-neutral-400 hover:bg-surface-2 hover:text-white"
                    }`}
                  >
                    {f.label}
                    <span className="num text-xs text-neutral-500">{n}</span>
                  </button>
                );
              })}
            </div>
          )}

          {packs.length === 0 ? (
            <Empty icon={<Package />}>Nothing found</Empty>
          ) : (
            <div className="grid items-start gap-4 md:grid-cols-2">
              {packs.map((p) => (
                <PackCard key={p.id} pack={p} done={done} showProgress={Boolean(profile)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PackCard({ pack, done, showProgress }: { pack: Pack; done: ReadonlySet<number>; showProgress: boolean }) {
  const [open, setOpen] = useState(false);
  const have = pack.levels.filter((l) => done.has(l.id)).length;
  const complete = isPackDone(pack, done);
  const total = pack.levels.length;
  const shown = open ? pack.levels : pack.levels.slice(0, PREVIEW);

  return (
    <article className="card flex flex-col overflow-hidden">
      <header className="flex flex-col gap-4 px-5 pb-4 pt-5">
        <div className="flex items-start gap-3">
          {/* the pack color is only this dot */}
          <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: pack.color }} />
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-lg font-medium leading-tight text-white">
              <span className="truncate">{pack.name}</span>
              {complete && <Check className="h-4 w-4 shrink-0 text-emerald-400" strokeWidth={2.5} aria-label="Completed" />}
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              {total} level{total === 1 ? "" : "s"}
              {total > 0 && <> · hardest #{pack.levels[0].position}</>}
            </p>
          </div>
          {pack.bonus_points > 0 && (
            <div className="shrink-0 text-right">
              <div className="num text-lg leading-tight text-white">{formatBonus(pack.bonus_points)}</div>
              <div className="text-xs text-neutral-500">bonus pts</div>
            </div>
          )}
        </div>
        {showProgress && <Progress value={have} total={total} />}
      </header>

      <ul className="flex-1 divide-y divide-line border-t border-line">
        {shown.map((l) => {
          const got = done.has(l.id);
          return (
            <li key={l.id}>
              <Link to={`/level/${l.id}`} className="flex h-10 items-center gap-3 px-5 text-sm transition-colors hover:bg-surface-2">
                <span className="num w-9 shrink-0 text-xs text-neutral-500">#{l.position}</span>
                <span className={`min-w-0 flex-1 truncate ${got ? "text-white" : "text-neutral-300"}`}>{l.name}</span>
                <span className="num hidden shrink-0 text-xs text-neutral-500 sm:inline">{formatPoints(levelPoints(l.position))}</span>
                {got ? (
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" strokeWidth={2.5} aria-label="Completed" />
                ) : (
                  showProgress && <span className="h-4 w-4 shrink-0" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {total > PREVIEW && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex h-10 items-center justify-center gap-1.5 border-t border-line text-xs text-neutral-400 transition-colors hover:bg-surface-2 hover:text-white"
        >
          {open ? "Show less" : `Show all ${total} levels`}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    </article>
  );
}
