import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ListOrdered, Search } from "lucide-react";
import { supabase } from "../lib/supabase";
import { must, useAsync } from "../lib/useAsync";
import type { Level } from "../lib/types";
import { formatPoints, levelPoints } from "../lib/points";
import { youtubeId, ytThumb } from "../lib/video";
import { Empty, ErrorBox, PageHeader, PositionBadge, Spinner } from "../components/ui";

export default function ListPage() {
  const { data, loading, error, reload } = useAsync(
    async () => must(await supabase.from("levels").select("*").order("position")) as Level[],
    [],
  );
  const [q, setQ] = useState("");

  // Refresh when moderators change the list
  useEffect(() => {
    const ch = supabase
      .channel("levels-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "levels" }, () => void reload())
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [reload]);

  const levels = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!data) return [];
    return s ? data.filter((l) => [l.name, l.creator, l.verifier].some((v) => v.toLowerCase().includes(s))) : data;
  }, [data, q]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Challenge list"
        subtitle={data ? `${data.length} levels` : undefined}
        right={
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      />

      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : levels.length === 0 ? (
        <Empty icon={<ListOrdered />}>{q ? "Nothing found" : "The list is empty"}</Empty>
      ) : (
        <div className="flex flex-col gap-2.5">
          {levels.map((l) => (
            <LevelCard key={l.id} level={l} />
          ))}
        </div>
      )}
    </div>
  );
}

function LevelCard({ level }: { level: Level }) {
  const yt = youtubeId(level.video_url);
  return (
    <Link
      to={`/level/${level.id}`}
      className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-line bg-transparent p-3 transition-colors hover:border-neutral-600 sm:gap-4 sm:p-4"
    >
      {/* Blurred verification thumbnail as the card cover */}
      {yt && (
        <img
          src={ytThumb(yt)}
          alt=""
          loading="lazy"
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-[3px] transition-opacity duration-300 group-hover:opacity-40"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/70 to-bg/40" />

      <div className="relative flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <PositionBadge position={level.position} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-white sm:text-lg">{level.name}</h3>
          <p className="truncate text-sm text-neutral-400">
            {level.creator} <span className="text-neutral-600">·</span> verified by {level.verifier}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-semibold tabular-nums text-white">{formatPoints(levelPoints(level.position))}</div>
          <div className="text-xs text-neutral-500">points</div>
        </div>
      </div>
    </Link>
  );
}
