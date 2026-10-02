import { Link, useParams } from "react-router";
import { motion } from "framer-motion";
import { Ban, CheckCircle2, Clock, ListChecks, Settings, XCircle } from "lucide-react";
import { supabase, errorText } from "../lib/supabase";
import { must, useAsync } from "../lib/useAsync";
import { useAuth } from "../lib/auth";
import type { LeaderboardRow, Level, Profile, RecordRow, RecordStatus } from "../lib/types";
import { formatPoints, levelPoints } from "../lib/points";
import { countryName } from "../lib/countries";
import { formatDate, timeAgo } from "../lib/time";
import { Empty, ErrorBox, Flag, RoleBadge, SocialLinks, Spinner, VideoLink } from "../components/ui";

type RecordWithLevel = RecordRow & { level: Pick<Level, "id" | "name" | "position"> };

const STATUS: Record<RecordStatus, { label: string; cls: string; icon: typeof Clock }> = {
  pending: { label: "Pending", cls: "text-amber-400", icon: Clock },
  approved: { label: "Accepted", cls: "text-emerald-400", icon: CheckCircle2 },
  rejected: { label: "Rejected", cls: "text-red-400", icon: XCircle },
};

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
      const [stats, verified] = await Promise.all([
        supabase.from("leaderboard").select("*").eq("registered", false).eq("username", name).maybeSingle(),
        supabase.from("levels").select("id, name, position").is("verifier_id", null).eq("verifier", name).order("position"),
      ]);
      const guest = must(stats) as LeaderboardRow | null;
      return guest ? { guest, verified: must(verified) as Pick<Level, "id" | "name" | "position">[] } : null;
    }
    const [stats, records, verified] = await Promise.all([
      supabase.from("leaderboard").select("*").eq("id", profile.id).maybeSingle(),
      // RLS: others see only approved records; the owner (and staff) also see pending/rejected
      supabase.from("records").select("*, level:levels(id, name, position)").eq("player_id", profile.id).order("created_at", { ascending: false }),
      supabase.from("levels").select("id, name, position").eq("verifier_id", profile.id).order("position"),
    ]);
    return {
      profile,
      stats: must(stats) as LeaderboardRow | null,
      records: must(records) as unknown as RecordWithLevel[],
      verified: must(verified) as Pick<Level, "id" | "name" | "position">[],
    };
  }, [username]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Empty>Player not found</Empty>;
  if (data.guest) return <GuestProfile row={data.guest} verified={data.verified} />;

  const { profile, stats, records, verified } = data;
  const isMe = me?.id === profile.id;
  const approved = records.filter((r) => r.status === "approved");
  const visible = isMe ? records : approved;
  const hardest = [...approved.map((r) => r.level), ...verified].sort((a, b) => a.position - b.position)[0];

  async function withdraw(id: number) {
    if (!confirm("Withdraw this submission?")) return;
    const { error } = await supabase.from("records").delete().eq("id", id);
    if (error) alert(errorText(error));
    void reload();
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mx-auto flex max-w-3xl flex-col gap-4">
      {/* Header */}
      <div className="card p-5 sm:p-6">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:text-left">
          <Flag code={profile.country} className="text-5xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-white">{profile.username}</h1>
              <RoleBadge role={profile.role} />
            </div>
            <p className="mt-1 text-sm text-muted">
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

        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="Rank" value={stats ? `#${stats.rank}` : "—"} />
          <Stat label="Points" value={stats ? formatPoints(stats.points) : "0"} />
          <Stat label="Completed" value={String(approved.length)} />
          <Stat label="Verifications" value={String(verified.length)} />
        </div>

        {hardest && (
          <Link to={`/level/${hardest.id}`} className="mt-2.5 flex items-center justify-between rounded-lg border border-line bg-surface-2 px-4 py-3 transition-colors hover:border-neutral-600">
            <div>
              <div className="text-xs text-muted">Hardest level</div>
              <div className="mt-0.5 font-medium text-white">
                <span className="text-brand">#{hardest.position}</span> {hardest.name}
              </div>
            </div>
            <span className="text-sm tabular-nums text-muted">{formatPoints(levelPoints(hardest.position))}</span>
          </Link>
        )}
      </div>

      {/* Verifications */}
      {verified.length > 0 && <VerifiedList levels={verified} />}

      {/* Records */}
      <section className="card">
        <h2 className="flex items-center justify-between border-b border-line px-4 py-3 text-sm font-medium text-muted">
          <span>{isMe ? "My records & submissions" : "Records"}</span>
          <span className="tabular-nums">{visible.length}</span>
        </h2>
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted">
            <ListChecks className="h-6 w-6" />
            {isMe ? (
              <>
                You haven't submitted any records yet.
                <Link to="/submit" className="btn-primary mt-2 !py-1.5">
                  Submit a record
                </Link>
              </>
            ) : (
              "No accepted records yet"
            )}
          </div>
        ) : (
          <div className="divide-y divide-line">
            {visible.map((r) => {
              const s = STATUS[r.status];
              const Icon = s.icon;
              return (
                <div key={r.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <Link to={`/level/${r.level.id}`} className="min-w-0 flex-1 truncate text-sm">
                      <span className="tabular-nums text-muted">#{r.level.position}</span> <span className="font-medium text-white hover:text-brand">{r.level.name}</span>
                    </Link>
                    {isMe && <span className="hidden text-xs text-neutral-600 sm:inline">{timeAgo(r.created_at)}</span>}
                    <span className={`flex items-center gap-1 text-xs ${s.cls}`} title={s.label}>
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{s.label}</span>
                    </span>
                    <VideoLink url={r.video_url} />
                  </div>
                  {isMe && r.review_note && (
                    <p className={`mt-1 text-xs ${r.status === "rejected" ? "text-red-300" : "text-muted"}`}>Staff note: {r.review_note}</p>
                  )}
                  {isMe && r.status === "pending" && (
                    <button onClick={() => withdraw(r.id)} className="mt-1 text-xs text-muted hover:text-red-400">
                      Withdraw
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </motion.div>
  );
}

function VerifiedList({ levels }: { levels: Pick<Level, "id" | "name" | "position">[] }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-medium text-muted">Verifications</h2>
      <div className="flex flex-wrap gap-1.5">
        {levels.map((l) => (
          <Link key={l.id} to={`/level/${l.id}`} className="rounded-md border border-line px-2.5 py-1 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:text-white">
            <span className="text-muted">#{l.position}</span> {l.name}
          </Link>
        ))}
      </div>
    </section>
  );
}

function GuestProfile({ row, verified }: { row: LeaderboardRow; verified: Pick<Level, "id" | "name" | "position">[] }) {
  const hardest = verified[0];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="card p-5 sm:p-6">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:text-left">
          <Flag code={null} className="text-5xl" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-white">{row.username}</h1>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="Rank" value={`#${row.rank}`} />
          <Stat label="Points" value={formatPoints(row.points)} />
          <Stat label="Completed" value="0" />
          <Stat label="Verifications" value={String(row.verifications)} />
        </div>
        {hardest && (
          <Link to={`/level/${hardest.id}`} className="mt-2.5 flex items-center justify-between rounded-lg border border-line bg-surface-2 px-4 py-3 transition-colors hover:border-neutral-600">
            <div>
              <div className="text-xs text-muted">Hardest level</div>
              <div className="mt-0.5 font-medium text-white">
                <span className="text-brand">#{hardest.position}</span> {hardest.name}
              </div>
            </div>
            <span className="text-sm tabular-nums text-muted">{formatPoints(levelPoints(hardest.position))}</span>
          </Link>
        )}
      </div>
      {verified.length > 0 && <VerifiedList levels={verified} />}
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums text-white">{value}</div>
    </div>
  );
}
