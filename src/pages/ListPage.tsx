import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ListOrdered, Search } from "lucide-react";
import { supabase } from "../lib/supabase";
import { must, useAsync } from "../lib/useAsync";
import type { Level } from "../lib/types";
import { formatPoints, levelPoints } from "../lib/points";
import { youtubeId, ytThumb } from "../lib/video";
import { Empty, ErrorBox, PageHeader, PositionBadge, Spinner } from "../components/ui";
import { DoneCheck } from "../components/PackBadge";
import { useMyCompletions } from "../lib/completions";

export default function ListPage() {
  const { data, loading, error, reload } = useAsync(
    async () => must(await supabase.from("levels").select("*").order("position")) as Level[],
    [],
  );
  const [q, setQ] = useState("");
  const { done } = useMyCompletions();

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
    <div className="max-w-5xl">
      <PageHeader
        title="Challenge list"
        subtitle={data ? `${data.length} levels${done.size ? ` · ${data.filter((l) => done.has(l.id)).length} completed` : ""}` : undefined}
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
        <div className="card divide-y divide-line overflow-hidden">
          {levels.map((l) => (
            <LevelRow key={l.id} level={l} done={done.has(l.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function LevelRow({ level, done }: { level: Level; done: boolean }) {
  const yt = youtubeId(level.video_url);
  const fps = level.fps ? (/^\d+$/.test(level.fps) ? `${level.fps} FPS` : level.fps) : null;
  return (
    <Link to={`/level/${level.id}`} className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2">
      <PositionBadge position={level.position} />
      {/* frame from the verification video */}
      <div className="hidden aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-surface-2 sm:block">
        {yt && <img src={ytThumb(yt)} alt="" loading="lazy" className="h-full w-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-base font-medium text-white">{level.name}</h3>
          {done && <DoneCheck title="You completed this level" />}
        </div>
        <p className="mt-0.5 truncate text-sm text-neutral-400">
          {level.creator} · verified by {level.verifier}
          {fps && <span className="text-neutral-500"> · {fps}</span>}
        </p>
      </div>
      <span className="num shrink-0 text-sm text-neutral-300">{formatPoints(levelPoints(level.position))}</span>
    </Link>
  );
}
