import { useState } from "react";
import { Link } from "react-router";
import { Check, Inbox, X } from "lucide-react";
import { supabase, errorText } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import type { Level, Profile, RecordRow } from "../../lib/types";
import { timeAgo } from "../../lib/time";
import { Empty, ErrorBox, Flag, Spinner, VideoLink } from "../../components/ui";

type Pending = RecordRow & {
  level: Pick<Level, "id" | "name" | "position">;
  player: Pick<Profile, "username" | "country">;
};

export default function RecordsTab() {
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
        <PendingCard key={r.id} r={r} onDone={reload} />
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
