import { useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Check, Copy, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import { must, useAsync } from "../lib/useAsync";
import type { Level, Profile } from "../lib/types";
import { formatPoints, levelPoints } from "../lib/points";
import { formatDate } from "../lib/time";
import { Empty, ErrorBox, Flag, Spinner, VideoEmbed, VideoLink } from "../components/ui";

type Victor = { id: number; video_url: string; reviewed_at: string | null; player: Pick<Profile, "username" | "country" | "banned"> };
type LevelWithVerifier = Level & { verifier_profile: Pick<Profile, "username" | "country"> | null };

export default function LevelPage() {
  const { id } = useParams();
  const { data, loading, error } = useAsync(async () => {
    const level = must(
      await supabase
        .from("levels")
        .select("*, verifier_profile:profiles!levels_verifier_id_fkey(username, country)")
        .eq("id", Number(id))
        .maybeSingle(),
    ) as LevelWithVerifier | null;
    if (!level) return null;
    const victors = (
      must(
        await supabase
          .from("records")
          .select("id, video_url, reviewed_at, player:profiles!records_player_id_fkey(username, country, banned)")
          .eq("level_id", level.id)
          .eq("status", "approved")
          .order("reviewed_at"),
      ) as unknown as Victor[]
    ).filter((v) => !v.player.banned);
    return { level, victors };
  }, [id]);
  const [copied, setCopied] = useState(false);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Empty>Level not found</Empty>;

  const { level, victors } = data;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link to="/" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to list
      </Link>

      <div>
        <div className="flex items-baseline gap-3">
          <span className={`text-2xl font-semibold tabular-nums ${level.position <= 3 ? "text-brand" : "text-neutral-500"}`}>#{level.position}</span>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{level.name}</h1>
        </div>
        <p className="mt-1 text-sm text-muted">
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
      </div>

      <VideoEmbed url={level.video_url} title={level.name} />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <Stat label="Points" value={formatPoints(levelPoints(level.position))} />
        <Stat label="Position" value={`#${level.position}`} />
        <Stat label="Victors" value={String(victors.length)} />
        <Stat label="FPS" value={level.fps ?? "—"} />
        <div className="card p-3">
          <div className="text-xs text-muted">Level ID</div>
          {level.gd_id ? (
            <button
              onClick={() => {
                void navigator.clipboard.writeText(String(level.gd_id));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="mt-0.5 flex items-center gap-1.5 font-semibold tabular-nums text-white hover:text-brand"
              title="Copy"
            >
              {level.gd_id}
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-muted" />}
            </button>
          ) : (
            <div className="mt-0.5 font-semibold text-muted">—</div>
          )}
        </div>
      </div>

      <section>
        <h2 className="mb-2.5 text-sm font-medium text-muted">Records · {victors.length}</h2>
        {victors.length === 0 ? (
          <Empty icon={<Users />}>No one has beaten this level yet</Empty>
        ) : (
          <div className="card divide-y divide-line">
            {victors.map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                <Flag code={v.player.country} />
                <Link to={`/player/${v.player.username}`} className="min-w-0 flex-1 truncate text-sm font-medium text-white hover:text-brand">
                  {v.player.username}
                </Link>
                {v.reviewed_at && <span className="hidden text-xs text-muted sm:inline">{formatDate(v.reviewed_at)}</span>}
                <VideoLink url={v.video_url} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums text-white">{value}</div>
    </div>
  );
}
