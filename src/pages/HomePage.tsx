import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight, Film } from "lucide-react";
import { supabase } from "../lib/supabase";
import { must, useAsync } from "../lib/useAsync";
import { useAuth } from "../lib/auth";
import { useMyCompletions } from "../lib/completions";
import type { ChangelogEntry, LeaderboardRow, Level, Profile } from "../lib/types";
import { formatPoints, levelPoints } from "../lib/points";
import { timeAgo } from "../lib/time";
import { videoThumb } from "../lib/video";
import ChangelogItem from "../components/ChangelogItem";
import { DoneCheck } from "../components/PackBadge";
import { ErrorBox, Flag, PositionBadge, Progress, Spinner } from "../components/ui";

type TopLevel = Pick<Level, "id" | "name" | "creator" | "verifier" | "position" | "video_url">;
type RecentRecord = {
  id: number;
  reviewed_at: string | null;
  level: Pick<Level, "id" | "name" | "position">;
  player: Pick<Profile, "username" | "country" | "banned">;
};

export default function HomePage() {
  const { profile } = useAuth();
  const { done } = useMyCompletions();
  const { data, loading, error } = useAsync(async () => {
    const [levels, players, top, recent, changes, packs] = await Promise.all([
      supabase.from("levels").select("id, name, creator, verifier, position, video_url").order("position"),
      supabase.from("leaderboard").select("id", { count: "exact", head: true }),
      supabase.from("leaderboard").select("*").order("rank").limit(6),
      supabase
        .from("records")
        .select("id, reviewed_at, level:levels(id, name, position), player:profiles!records_player_id_fkey(username, country, banned)")
        .eq("status", "approved")
        .not("reviewed_at", "is", null)
        .order("reviewed_at", { ascending: false })
        .limit(10),
      supabase.from("changelog").select("*").order("created_at", { ascending: false }).limit(4),
      supabase.from("packs").select("id", { count: "exact", head: true }),
    ]);
    return {
      levels: must(levels) as TopLevel[],
      players: players.count ?? 0,
      packs: packs.count ?? 0,
      top: must(top) as LeaderboardRow[],
      recent: (must(recent) as unknown as RecentRecord[]).filter((r) => !r.player.banned).slice(0, 6),
      changes: must(changes) as ChangelogEntry[],
    };
  }, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  const { levels, players, packs, top, recent, changes } = data;
  const mine = levels.filter((l) => done.has(l.id)).length;

  return (
    <div className="flex flex-col gap-16">
      {/* Hero: what the list is, on the left; the three hardest levels as the one bright thing on the right */}
      <section className="grid items-center gap-10 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="max-w-xl">
          <h1 className="text-4xl font-medium leading-[1.06] tracking-[-0.02em] text-white sm:text-5xl xl:text-[56px] xl:tracking-[-0.03em]">
            Welcome to the ChallengeGrind
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-neutral-400">Grind the challenges, farm points, clear packs, send your own level!</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/list" className="btn-primary h-11 px-5">
              Open the list
            </Link>
            <Link to="/submit" className="btn-ghost h-11 px-5">
              Submit a record
            </Link>
          </div>
          <dl className="mt-10 flex gap-8">
            <Figure label="Levels" value={levels.length} />
            <Figure label="Players" value={players} />
            <Figure label="Packs" value={packs} />
          </dl>
          {profile && levels.length > 0 && <Progress className="mt-8 max-w-sm" value={mine} total={levels.length} label="Your progress" />}
        </div>

        <TopThree levels={levels.slice(0, 3)} done={done} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title="Recent records" link={{ to: "/stats", label: "Stats Viewer" }}>
          {recent.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No accepted records yet</p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((r) => (
                <li key={r.id} className="flex h-12 items-center gap-3 px-4">
                  <Flag code={r.player.country} />
                  <p className="min-w-0 flex-1 truncate text-sm text-neutral-400">
                    <Link to={`/player/${r.player.username}`} className="text-white hover:text-brand">
                      {r.player.username}
                    </Link>{" "}
                    beat{" "}
                    <Link to={`/level/${r.level.id}`} className="text-white hover:text-brand">
                      {r.level.name}
                    </Link>
                  </p>
                  <span className="num hidden shrink-0 text-xs text-neutral-500 sm:inline">#{r.level.position}</span>
                  <span className="num shrink-0 whitespace-nowrap text-right text-xs text-neutral-500">{r.reviewed_at ? timeAgo(r.reviewed_at) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Top players" link={{ to: "/stats", label: "All players" }}>
          <TopPlayers rows={top} />
        </Section>
      </div>

      <Section title="List changes" link={{ to: "/changelog", label: "Changelog" }}>
        {changes.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">No changes yet</p>
        ) : (
          <div className="divide-y divide-line">
            {changes.map((e) => (
              <ChangelogItem key={e.id} entry={e} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="num mt-1 text-2xl text-white">{value.toLocaleString("en-US")}</dd>
    </div>
  );
}

function Section({ title, link, children }: { title: string; link?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-medium text-white">{title}</h2>
        {link && (
          <Link to={link.to} className="flex items-center gap-1.5 text-sm text-neutral-400 transition-colors hover:text-white">
            {link.label} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="card overflow-hidden">{children}</div>
    </section>
  );
}

/** #1 large, #2 and #3 below it — real frames from the verification videos */
function TopThree({ levels, done }: { levels: TopLevel[]; done: ReadonlySet<number> }) {
  if (!levels.length) return null;
  const [first, ...rest] = levels;
  return (
    <div className="flex flex-col gap-3">
      <LevelCover level={first} done={done.has(first.id)} large />
      <div className="grid grid-cols-2 gap-3">
        {rest.map((l) => (
          <LevelCover key={l.id} level={l} done={done.has(l.id)} />
        ))}
      </div>
    </div>
  );
}

function LevelCover({ level, done, large }: { level: TopLevel; done: boolean; large?: boolean }) {
  const img = videoThumb(level.video_url, true);
  return (
    <Link to={`/level/${level.id}`} className="group card overflow-hidden transition-colors hover:border-neutral-600">
      <div className="relative aspect-video overflow-hidden bg-surface-2">
        {img ? (
          <img
            src={img}
            alt={`${level.name} verification`}
            loading={large ? "eager" : "lazy"}
            className="h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-90"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        ) : (
          <div className="grid h-full place-items-center text-neutral-600">
            <Film className="h-6 w-6" />
          </div>
        )}
      </div>
      <div className={`flex items-center gap-3 ${large ? "px-5 py-4" : "px-4 py-3"}`}>
        <PositionBadge position={level.position} className={large ? "w-auto text-base" : "w-auto"} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className={`truncate font-medium text-white ${large ? "text-lg" : "text-sm"}`}>{level.name}</h3>
            {done && <DoneCheck title="You completed this level" />}
          </div>
          {large && (
            <p className="truncate text-sm text-neutral-400">
              {level.creator} · verified by {level.verifier}
            </p>
          )}
        </div>
        <span className={`num shrink-0 text-neutral-400 ${large ? "text-sm" : "hidden text-xs sm:inline"}`}>{formatPoints(levelPoints(level.position))}</span>
      </div>
    </Link>
  );
}

/** Ranked list with thin bars against the leader; only the leader's bar carries the accent */
function TopPlayers({ rows }: { rows: LeaderboardRow[] }) {
  if (!rows.length) return <p className="px-4 py-6 text-sm text-muted">No players with points yet</p>;
  const max = rows[0].points || 1;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id ?? `guest:${r.username}`}>
          <Link to={`/player/${encodeURIComponent(r.username)}`} className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-surface-2">
            <div className="flex items-center gap-3">
              <span className={`num w-5 shrink-0 text-sm ${r.rank === 1 ? "text-brand" : "text-neutral-500"}`}>{r.rank}</span>
              <Flag code={r.country} />
              <span className="min-w-0 flex-1 truncate text-sm text-white">{r.username}</span>
              <span className="num shrink-0 text-sm text-neutral-300">{formatPoints(r.points)}</span>
            </div>
            <div className="ml-8 h-0.5 overflow-hidden rounded-full bg-surface-3">
              <div className={`h-full rounded-full ${r.rank === 1 ? "bg-brand" : "bg-neutral-600"}`} style={{ width: `${(r.points / max) * 100}%` }} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
