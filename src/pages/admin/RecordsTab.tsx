import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Check, Copy, Inbox, Search, X } from "lucide-react";
import { supabase, errorText } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import type { Level, Profile, RecordRow } from "../../lib/types";
import { timeAgo } from "../../lib/time";
import { useBadges } from "../../lib/badges";
import { Empty, ErrorBox, Flag, Spinner, VideoLink } from "../../components/ui";
import RevokeButton from "../../components/RevokeButton";
import { formatDate } from "../../lib/time";

type Pending = RecordRow & {
  level: Pick<Level, "id" | "name" | "position">;
  player: Pick<Profile, "username" | "country">;
};

export default function RecordsTab() {
  const [mode, setMode] = useState<"pending" | "accepted">("pending");
  const { pendingRecords } = useBadges();
  const tab = (id: typeof mode, label: string, n?: number) => (
    <button
      onClick={() => setMode(id)}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${mode === id ? "bg-surface-3 font-medium text-white" : "text-muted hover:text-white"}`}
    >
      {label}
      {n ? <span className="tabular-nums text-xs text-muted">{n}</span> : null}
    </button>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-fit gap-1 rounded-lg border border-line bg-surface-2 p-1">
        {tab("pending", "Pending", pendingRecords)}
        {tab("accepted", "Accepted")}
      </div>
      {mode === "pending" ? <PendingRecords /> : <AcceptedRecords />}
    </div>
  );
}

function PendingRecords() {
  const { refresh } = useBadges();
  const { data, loading, error, reload } = useAsync(
    async () =>
      must(
        await supabase
          .from("records")
          .select("*, level:levels(id, name, position), player:profiles!records_player_id_fkey(username, country)")
          .eq("status", "pending")
          .order("created_at"),
      ) as unknown as Pending[],
    [],
  );

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} />;
  if (!data?.length) return <Empty icon={<Inbox />}>No pending records</Empty>;

  return (
    <div className="flex flex-col gap-2.5">
      {data.map((r) => (
        <PendingCard key={r.id} r={r}
          onDone={() => {
            void reload();
            refresh(); // update the red counters right away
          }}
        />
      ))}
    </div>
  );
}

function PendingCard({ r, onDone }: { r: Pending; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function review(approve: boolean) {
    setErr("");
    if (!approve && !note.trim()) return setErr("Enter a reason for rejecting");
    setBusy(true);
    const { error } = await supabase.rpc("review_record", { p_record_id: r.id, p_approve: approve, p_note: note.trim() || null });
    setBusy(false);
    if (error) return setErr(errorText(error));
    onDone();
  }

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Flag code={r.player.country} />
            <Link to={`/player/${r.player.username}`} className="font-medium text-white hover:text-brand">
              {r.player.username}
            </Link>
            <span className="text-muted">→</span>
            <Link to={`/level/${r.level.id}`} className="text-white hover:text-brand">
              <span className="text-muted">#{r.level.position}</span> {r.level.name}
            </Link>
          </div>
          <div className="mt-0.5 text-xs text-muted">{timeAgo(r.created_at)}</div>
          {r.note && <p className="mt-2 whitespace-pre-line rounded-md bg-surface-2 px-3 py-2 text-sm text-neutral-300">{r.note}</p>}
        </div>
        <VideoLink url={r.video_url} />
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          className="input flex-1"
          placeholder="Note (optional when accepting, required when rejecting)"
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex gap-2">
          <button className="btn-ghost flex-1 !text-emerald-400 sm:flex-none" disabled={busy} onClick={() => review(true)}>
            <Check className="h-4 w-4" /> Accept
          </button>
          <button className="btn-danger flex-1 sm:flex-none" disabled={busy} onClick={() => review(false)}>
            <X className="h-4 w-4" /> Reject
          </button>
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
    </div>
  );
}

type Accepted = RecordRow & { level: Pick<Level, "id" | "name" | "position"> };

/** Accepted records of one player, with a Remove button; records sharing a video are flagged */
function AcceptedRecords() {
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const { data, loading, error, reload } = useAsync(async () => {
    if (!name) return null;
    // case-insensitive exact match; escape LIKE wildcards ("_" is allowed in nicknames)
    const pattern = name.replace(/[\\%_]/g, (c) => `\\${c}`);
    const player = must(await supabase.from("profiles").select("id, username, country").ilike("username", pattern).maybeSingle()) as Pick<
      Profile,
      "id" | "username" | "country"
    > | null;
    if (!player) return { player: null, records: [] as Accepted[] };
    const records = must(
      await supabase.from("records").select("*, level:levels(id, name, position)").eq("player_id", player.id).eq("status", "approved"),
    ) as unknown as Accepted[];
    return { player, records: records.sort((a, b) => a.level.position - b.level.position) };
  }, [name]);

  const search = (e: FormEvent) => {
    e.preventDefault();
    setName(q.trim().replace(/^@/, ""));
  };

  // how many accepted records use each video
  const uses = new Map<string, number>();
  for (const r of data?.records ?? []) uses.set(r.video_url, (uses.get(r.video_url) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={search} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Player nickname" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn-primary">Show</button>
      </form>

      {!name ? (
        <p className="text-sm text-muted">Find a player to see their accepted records. You can also remove a record from the level page.</p>
      ) : loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : !data?.player ? (
        <Empty>No player called “{name}”</Empty>
      ) : !data.records.length ? (
        <Empty>{data.player.username} has no accepted records</Empty>
      ) : (
        <div className="card divide-y divide-line">
          <div className="flex items-center gap-2 px-4 py-2.5 text-sm">
            <Flag code={data.player.country} />
            <Link to={`/player/${data.player.username}`} className="font-medium text-white hover:text-brand">
              {data.player.username}
            </Link>
            <span className="text-muted">· {data.records.length} accepted</span>
          </div>
          {data.records.map((r) => {
            const shared = (uses.get(r.video_url) ?? 0) > 1;
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
                <Link to={`/level/${r.level.id}`} className="min-w-0 flex-1 truncate text-sm">
                  <span className="tabular-nums text-muted">#{r.level.position}</span> <span className="font-medium text-white hover:text-brand">{r.level.name}</span>
                </Link>
                {shared && (
                  <span className="flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-300" title={r.video_url}>
                    <Copy className="h-3 w-3" /> same video ×{uses.get(r.video_url)}
                  </span>
                )}
                {r.reviewed_at && <span className="hidden text-xs text-muted sm:inline">{formatDate(r.reviewed_at)}</span>}
                <VideoLink url={r.video_url} />
                <RevokeButton recordId={r.id} label={`the record on ${r.level.name}`} onDone={() => void reload()} compact />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
