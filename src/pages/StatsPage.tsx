import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Search, Trophy } from "lucide-react";
import { supabase } from "../lib/supabase";
import { must, useAsync } from "../lib/useAsync";
import type { LeaderboardRow } from "../lib/types";
import { formatPoints } from "../lib/points";
import { COUNTRIES } from "../lib/countries";
import { Empty, ErrorBox, Flag, PageHeader, Spinner } from "../components/ui";

export default function StatsPage() {
  const { data, loading, error } = useAsync(
    async () => must(await supabase.from("leaderboard").select("*").order("rank").limit(1000)) as LeaderboardRow[],
    [],
  );
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");

  const countries = useMemo(() => {
    const present = new Set((data ?? []).map((r) => r.country).filter(Boolean));
    return COUNTRIES.filter((c) => present.has(c.code));
  }, [data]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((r) => (!s || r.username.toLowerCase().includes(s)) && (!country || r.country === country));
  }, [data, q, country]);

  return (
    <div className="max-w-5xl">
      <PageHeader title="Stats Viewer" />

      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Find a player" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input sm:w-52" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : rows.length === 0 ? (
        <Empty icon={<Trophy />}>No players with points yet</Empty>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-[3.5rem_1fr_6rem_5rem_minmax(0,1fr)] gap-4 border-b border-line px-4 py-3 text-xs text-neutral-500 md:grid">
            <span>#</span>
            <span>Player</span>
            <span className="text-right">Points</span>
            <span className="text-right">Completed</span>
            <span>Hardest</span>
          </div>
          <div className="divide-y divide-line">
            {rows.map((r) => (
              <Link
                key={r.id ?? `guest:${r.username}`}
                to={`/player/${encodeURIComponent(r.username)}`}
                className="grid h-12 grid-cols-[2.75rem_1fr_auto] items-center gap-3 px-4 transition-colors hover:bg-surface-2 md:grid-cols-[3.5rem_1fr_6rem_5rem_minmax(0,1fr)] md:gap-4"
              >
                <span className={`num text-sm ${r.rank <= 3 ? "text-brand" : "text-neutral-500"}`}>{r.rank}</span>
                <span className="flex min-w-0 items-center gap-2.5">
                  <Flag code={r.country} />
                  <span className="truncate text-sm text-white">{r.username}</span>
                </span>
                <span className="num text-right text-sm text-white">{formatPoints(r.points)}</span>
                <span className="num hidden text-right text-sm text-neutral-400 md:block">{r.completions}</span>
                <span className="hidden truncate text-sm text-neutral-400 md:block">
                  #{r.hardest_position} {r.hardest_name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
