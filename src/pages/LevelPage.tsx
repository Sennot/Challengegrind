import { useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Check, Copy, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import { must, useAsync } from "../lib/useAsync";
import { CBF_LABEL, type Level, type Profile } from "../lib/types";
import { formatBonus, formatPoints, levelPoints } from "../lib/points";
import { formatDate } from "../lib/time";
import { Empty, ErrorBox, Flag, PositionBadge, Spec, Spinner, VideoEmbed, VideoLink } from "../components/ui";
import { DoneCheck, PackBadge } from "../components/PackBadge";
import { fetchLevelPacks, isPackDone, type Pack } from "../lib/packs";
import { useMyCompletions } from "../lib/completions";
import { useAuth } from "../lib/auth";
import RevokeButton from "../components/RevokeButton";

type Victor = { id: number; video_url: string; reviewed_at: string | null; player: Pick<Profile, "username" | "country" | "banned"> };
type LevelWithVerifier = Level & { verifier_profile: Pick<Profile, "username" | "country"> | null };

export default function LevelPage() {
  const { id } = useParams();
  const { rank } = useAuth();
  const { data, loading, error, reload } = useAsync(async () => {
    const level = must(
      await supabase
        .from("levels")
        .select("*, verifier_profile:profiles!levels_verifier_id_fkey(username, country)")
        .eq("id", Number(id))
        .maybeSingle(),
    ) as LevelWithVerifier | null;
    if (!level) return null;
    const [victorsRes, packs] = await Promise.all([
      supabase
        .from("records")
        .select("id, video_url, reviewed_at, player:profiles!records_player_id_fkey(username, country, banned)")
        .eq("level_id", level.id)
        .eq("status", "approved")
        .order("reviewed_at"),
      fetchLevelPacks(level.id),
    ]);
    const victors = (must(victorsRes) as unknown as Victor[]).filter((v) => !v.player.banned);
    return { level, victors, packs };
  }, [id]);
  const { done } = useMyCompletions();
  const [copied, setCopied] = useState(false);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Empty>Level not found</Empty>;

  const { level, victors, packs } = data;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Link to="/list" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to list
      </Link>

      <div>
        <div className="flex items-baseline gap-3">
          <PositionBadge position={level.position} className="w-auto text-xl sm:text-2xl" />
          <h1 className="min-w-0 break-words text-[28px] font-medium leading-tight text-white sm:text-4xl sm:tracking-[-0.01em]">{level.name}</h1>
          {done.has(level.id) && <DoneCheck className="self-center" title="You completed this level" />}
        </div>
        <p className="mt-2 text-sm text-neutral-400">
          by <span className="text-neutral-200">{level.creator}</span> · verified by{" "}
          {level.verifier_profile ? (
            <Link to={`/player/${level.verifier_profile.username}`} className="text-neutral-200 hover:text-brand">
              {level.verifier}
            </Link>
          ) : (
            <Link to={`/player/${encodeURIComponent(level.verifier)}`} className="text-neutral-200 hover:text-brand">
              {level.verifier}
            </Link>
          )}
        </p>
        {packs.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {packs.map((p) => (
              <a key={p.id} href={`#pack-${p.id}`} className="max-w-full rounded-md transition-opacity hover:opacity-80">
                <PackBadge pack={p} done={isPackDone(p, done)} />
              </a>
            ))}
          </div>
        )}
      </div>

      <VideoEmbed url={level.video_url} title={level.name} />

      {/* one spec strip instead of six equal cards */}
      <dl className="card grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 lg:divide-x lg:divide-line">
        <Spec label="Points" value={formatPoints(levelPoints(level.position))} />
        <Spec label="Position" value={`#${level.position}`} />
        <Spec label="Victors" value={String(victors.length)} />
        <Spec label="FPS" value={level.fps ?? "—"} />
        <Spec label="CBF" value={CBF_LABEL[level.cbf] ?? "—"} />
        <div className="px-4 py-3">
          <dt className="text-xs text-neutral-500">Level ID</dt>
          {level.gd_id ? (
            <button
              onClick={() => {
                void navigator.clipboard.writeText(String(level.gd_id));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="num mt-1 flex items-center gap-1.5 text-base text-white transition-colors hover:text-brand"
              title="Copy"
            >
              {level.gd_id}
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-neutral-500" />}
            </button>
          ) : (
            <dd className="num mt-1 text-base text-neutral-500">—</dd>
          )}
        </div>
      </dl>

      {packs.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-medium text-white">
            {packs.length === 1 ? "Pack" : "Packs"} <span className="num text-sm text-neutral-500">{packs.length}</span>
          </h2>
          <div className="flex flex-col gap-3">
            {packs.map((p) => (
              <PackCard key={p.id} pack={p} current={level.id} done={done} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-base font-medium text-white">
          Records <span className="num text-sm text-neutral-500">{victors.length}</span>
        </h2>
        {victors.length === 0 ? (
          <Empty icon={<Users />}>No one has beaten this level yet</Empty>
        ) : (
          <div className="card divide-y divide-line">
            {victors.map((v) => (
              <div key={v.id} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
                <Flag code={v.player.country} />
                <Link to={`/player/${v.player.username}`} className="min-w-0 flex-1 truncate text-sm font-medium text-white hover:text-brand">
                  {v.player.username}
                </Link>
                {v.reviewed_at && <span className="num hidden text-xs text-neutral-500 sm:inline">{formatDate(v.reviewed_at)}</span>}
                <VideoLink url={v.video_url} />
                {/* List Helper+: take an accepted record down */}
                {rank >= 1 && <RevokeButton recordId={v.id} label={`${v.player.username}'s record`} onDone={() => void reload()} compact />}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** A pack the level belongs to: its levels (this one highlighted, completed ones checked) and the bonus */
function PackCard({ pack, current, done }: { pack: Pack; current: number; done: ReadonlySet<number> }) {
  const have = pack.levels.filter((l) => done.has(l.id)).length;
  const complete = isPackDone(pack, done);
  return (
    <div id={`pack-${pack.id}`} className="card scroll-mt-20 overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: pack.color }} />
        <span className="min-w-0 flex-1 truncate font-medium text-white">{pack.name}</span>
        {pack.bonus_points > 0 && <span className="num text-sm text-neutral-400">{formatBonus(pack.bonus_points)} pts</span>}
        {done.size > 0 && (
          <span className={`num flex items-center gap-1 text-xs ${complete ? "text-emerald-400" : "text-neutral-500"}`}>
            {complete && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
            {have}/{pack.levels.length}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 p-3">
        {pack.levels.map((l) => (
          <Link
            key={l.id}
            to={`/level/${l.id}`}
            title={`#${l.position}`}
            className={`flex h-8 max-w-full items-center gap-2 rounded-md border px-2.5 text-sm transition-colors ${
              l.id === current ? "border-neutral-500 bg-surface-3 text-white" : "border-line text-neutral-300 hover:border-neutral-600 hover:text-white"
            }`}
          >
            <span className="num text-xs text-neutral-500">#{l.position}</span>
            <span className="truncate">{l.name}</span>
            {done.has(l.id) && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={2.5} />}
          </Link>
        ))}
      </div>
    </div>
  );
}
