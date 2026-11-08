import { Link, useParams } from "react-router";
import type { ReactNode } from "react";
import { Ban, Settings } from "lucide-react";
import { supabase, errorText } from "../lib/supabase";
import { must, useAsync } from "../lib/useAsync";
import { useAuth } from "../lib/auth";
import type { LeaderboardRow, Level, Profile, RecordRow } from "../lib/types";
import { formatBonus, formatPoints, levelPoints } from "../lib/points";
import { countryName } from "../lib/countries";
import { formatDate, timeAgo } from "../lib/time";
import { fetchPacks, isPackDone, type Pack } from "../lib/packs";
import { PackBadge } from "../components/PackBadge";
import { Empty, ErrorBox, Flag, PositionBadge, Progress, RoleBadge, STATUS, Spec, SocialLinks, Spinner, VideoLink } from "../components/ui";

type LevelRef = Pick<Level, "id" | "name" | "position">;
type RecordWithLevel = RecordRow & { level: LevelRef };

/** Accepted records + verifications, each level once, hardest first */
function mergeLevels(...lists: LevelRef[][]): LevelRef[] {
  const byId = new Map(lists.flat().map((l) => [l.id, l]));
  return [...byId.values()].sort((a, b) => a.position - b.position);
}

export default function ProfilePage() {
  const { username } = useParams();
  const { profile: me } = useAuth();

  const { data, loading, error, reload } = useAsync(async () => {
    // ilike for case-insensitive match; escape LIKE wildcards ("_" is allowed in usernames)
    const pattern = (username ?? "").replace(/[\\%_]/g, (c) => `\\${c}`);
    const profile = must(await supabase.from("profiles").select("*").ilike("username", pattern).maybeSingle()) as Profile | null;
    if (!profile) {
      // Player without an account (e.g. a verifier who hasn't registered yet)
      const name = username ?? "";
      const [stats, verified, packs] = await Promise.all([
        supabase.from("leaderboard").select("*").eq("registered", false).eq("username", name).maybeSingle(),
        supabase.from("levels").select("id, name, position").is("verifier_id", null).eq("verifier", name).order("position"),
        fetchPacks(),
      ]);
      const guest = must(stats) as LeaderboardRow | null;
      return guest ? { guest, verified: must(verified) as LevelRef[], packs } : null;
    }
    const [stats, records, verified, packs, total] = await Promise.all([
      supabase.from("leaderboard").select("*").eq("id", profile.id).maybeSingle(),
      // RLS: others see only approved records; the owner (and staff) also see pending/rejected
      supabase.from("records").select("*, level:levels(id, name, position)").eq("player_id", profile.id).order("created_at", { ascending: false }),
      supabase.from("levels").select("id, name, position").eq("verifier_id", profile.id).order("position"),
      fetchPacks(),
      supabase.from("levels").select("id", { count: "exact", head: true }),
    ]);
    return {
      profile,
      totalLevels: total.count ?? 0,
      stats: must(stats) as LeaderboardRow | null,
      records: must(records) as unknown as RecordWithLevel[],
      verified: must(verified) as LevelRef[],
      packs,
    };
  }, [username]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Empty>Player not found</Empty>;
  if (data.guest) return <GuestProfile row={data.guest} verified={data.verified} packs={data.packs} />;

  const { profile, stats, records, verified, packs, totalLevels } = data;
  const isMe = me?.id === profile.id;
  // Verifications count as completions too
  const completed = mergeLevels(records.filter((r) => r.status === "approved").map((r) => r.level), verified);
  const submissions = records.filter((r) => r.status !== "approved");
  const hardest = completed[0];
  const done = new Set(completed.map((l) => l.id));
  const donePacks = packs.filter((p) => isPackDone(p, done));

  async function withdraw(id: number) {
    if (!confirm("Withdraw this submission?")) return;
    const { error } = await supabase.from("records").delete().eq("id", id);
    if (error) alert(errorText(error));
    void reload();
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      {/* Header */}
      <div className="card p-5 sm:p-6">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
          <Flag code={profile.country} className="text-5xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className="truncate text-[28px] font-medium leading-tight text-white">{profile.username}</h1>
              <RoleBadge role={profile.role} />
            </div>
            <p className="mt-1 text-sm text-neutral-400">
              {profile.country ? countryName(profile.country) : "No country set"} · joined {formatDate(profile.created_at)}
            </p>
            {profile.bio && <p className="mt-3 whitespace-pre-line text-sm text-neutral-300">{profile.bio}</p>}
          </div>
          <div className="flex items-center gap-1">
            <SocialLinks s={profile} />
            {isMe && (
              <Link to="/settings" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-white" title="Settings">
                <Settings className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>

        {profile.banned && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/25 p-3 text-sm text-red-300">
            <Ban className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Account banned{profile.ban_reason ? `: ${profile.ban_reason}` : ""}</span>
          </div>
        )}

        <dl className="mt-6 grid grid-cols-2 rounded-xl border border-line sm:grid-cols-4 sm:divide-x sm:divide-line">
          <Spec label="Rank" value={stats ? `#${stats.rank}` : "—"} />
          <Spec label="Points" value={stats ? formatPoints(stats.points) : formatPoints(0)} />
          <Spec label="Completed" value={completed.length} />
          <Spec label="Verifications" value={verified.length} />
        </dl>
        {totalLevels > 0 && <Progress className="mt-5" value={completed.length} total={totalLevels} label="Levels of the list completed" />}

        {hardest && (
          <Link to={`/level/${hardest.id}`} className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 transition-colors hover:bg-surface-2">
            <div className="min-w-0">
              <div className="text-xs text-neutral-500">Hardest level</div>
              <div className="mt-1 flex min-w-0 items-baseline gap-2 font-medium text-white">
                <PositionBadge position={hardest.position} className="w-auto" />
                <span className="truncate">{hardest.name}</span>
              </div>
            </div>
            <span className="num shrink-0 text-sm text-neutral-400">{formatPoints(levelPoints(hardest.position))}</span>
          </Link>
        )}

        <div className="mt-6 flex flex-col gap-6">
          <LevelChips title="Completed levels" levels={completed}>
            {isMe ? (
              <>
                You haven't completed any challenges yet.{" "}
                <Link to="/submit" className="text-brand hover:underline">
                  Submit a record
                </Link>
              </>
            ) : (
              "No completed challenges yet"
            )}
          </LevelChips>
          {verified.length > 0 && <LevelChips title="Verified" levels={verified} />}
          <CompletedPacks packs={donePacks} bonus={stats?.pack_bonus ?? 0} />
        </div>
      </div>

      {/* Own pending / rejected submissions (RLS hides them from others) */}
      {isMe && submissions.length > 0 && (
        <section className="card">
          <h2 className="flex items-baseline gap-2 border-b border-line px-4 py-3 text-sm font-medium text-white">
            My submissions
            <span className="num text-xs text-neutral-500">{submissions.length}</span>
          </h2>
          <div className="divide-y divide-line">
            {submissions.map((r) => {
              const s = STATUS[r.status];
              const Icon = s.icon;
              return (
                <div key={r.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <Link to={`/level/${r.level.id}`} className="min-w-0 flex-1 truncate text-sm">
                      <span className="num text-xs text-neutral-500">#{r.level.position}</span> <span className="font-medium text-white hover:text-brand">{r.level.name}</span>
                    </Link>
                    <span className="hidden text-xs text-neutral-600 sm:inline">{timeAgo(r.created_at)}</span>
                    <span className={`flex items-center gap-1 text-xs ${s.cls}`} title={s.label}>
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{s.label}</span>
                    </span>
                    <VideoLink url={r.video_url} />
                  </div>
                  {r.review_note && <p className={`mt-1 text-xs ${r.status === "rejected" ? "text-red-300" : "text-muted"}`}>Staff note: {r.review_note}</p>}
                  {r.status === "pending" && (
                    <button onClick={() => withdraw(r.id)} className="mt-1 text-xs text-muted hover:text-red-400">
                      Withdraw
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/** Level-name chips, hardest first; `children` is shown when the list is empty */
function LevelChips({ title, levels, children }: { title: string; levels: LevelRef[]; children?: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-2 text-sm font-medium text-white">
        {title}
        <span className="num text-xs text-neutral-500">{levels.length}</span>
      </h2>
      {levels.length === 0 ? (
        <p className="text-sm text-neutral-500">{children}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {[...levels]
            .sort((a, b) => a.position - b.position)
            .map((l) => (
              <Link
                key={l.id}
                to={`/level/${l.id}`}
                title={`#${l.position}`}
                className="flex h-8 items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:text-white"
              >
                <span className="num text-xs text-neutral-500">#{l.position}</span>
                {l.name}
              </Link>
            ))}
        </div>
      )}
    </section>
  );
}

/** Packs where the player has every level; hidden when there are none */
function CompletedPacks({ packs, bonus }: { packs: Pack[]; bonus: number }) {
  if (!packs.length) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-2 text-sm font-medium text-white">
        Completed packs
        <span className="num text-xs text-neutral-500">{packs.length}</span>
        {bonus > 0 && <span className="num ml-auto text-xs text-neutral-400">{formatBonus(bonus)} pts</span>}
      </h2>
      <div className="flex flex-wrap gap-2">
        {packs.map((p) => (
          <PackBadge key={p.id} pack={p} done showBonus />
        ))}
      </div>
    </section>
  );
}

function GuestProfile({ row, verified, packs }: { row: LeaderboardRow; verified: LevelRef[]; packs: Pack[] }) {
  const hardest = verified[0];
  const done = new Set(verified.map((l) => l.id));
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="card p-5 sm:p-6">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:text-left">
          <Flag code={null} className="text-5xl" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[28px] font-medium leading-tight text-white">{row.username}</h1>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-2 rounded-xl border border-line sm:grid-cols-4 sm:divide-x sm:divide-line">
          <Spec label="Rank" value={`#${row.rank}`} />
          <Spec label="Points" value={formatPoints(row.points)} />
          <Spec label="Completed" value={verified.length} />
          <Spec label="Verifications" value={row.verifications} />
        </dl>
        {hardest && (
          <Link to={`/level/${hardest.id}`} className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 transition-colors hover:bg-surface-2">
            <div className="min-w-0">
              <div className="text-xs text-neutral-500">Hardest level</div>
              <div className="mt-1 flex min-w-0 items-baseline gap-2 font-medium text-white">
                <PositionBadge position={hardest.position} className="w-auto" />
                <span className="truncate">{hardest.name}</span>
              </div>
            </div>
            <span className="num shrink-0 text-sm text-neutral-400">{formatPoints(levelPoints(hardest.position))}</span>
          </Link>
        )}
        <div className="mt-6 flex flex-col gap-6">
          {/* Players without an account only have verifications, so one box says it all */}
          <LevelChips title="Verified" levels={verified}>
            No completed challenges yet
          </LevelChips>
          <CompletedPacks packs={packs.filter((p) => isPackDone(p, done))} bonus={row.pack_bonus} />
        </div>
      </div>
    </div>
  );
}
