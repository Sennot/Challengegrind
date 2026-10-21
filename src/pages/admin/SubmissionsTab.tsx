import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Inbox, X } from "lucide-react";
import { supabase, errorText } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import type { Level, LevelSubmission, Profile } from "../../lib/types";
import { timeAgo } from "../../lib/time";
import { BrandIcon, Empty, ErrorBox, Flag, Spinner, VideoLink } from "../../components/ui";
import { DraftFields, validate, type Draft } from "./LevelsTab";

type Pending = LevelSubmission & { submitter: Pick<Profile, "username" | "country"> };
type ListLevel = Pick<Level, "id" | "name" | "position">;

/** List Moderator+: review level submissions. Accepting puts the level on the list. */
export default function SubmissionsTab() {
  const { data, loading, error, reload } = useAsync(async () => {
    const subs = must(
      await supabase
        .from("level_submissions")
        .select("*, submitter:profiles!level_submissions_submitter_id_fkey(username, country)")
        .eq("status", "pending")
        .order("created_at"),
    ) as unknown as Pending[];
    const levels = must(await supabase.from("levels").select("id, name, position").order("position")) as ListLevel[];
    return { subs, levels };
  }, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} />;
  if (!data?.subs.length) return <Empty icon={<Inbox />}>No pending level submissions</Empty>;

  return (
    <div className="flex flex-col gap-2.5">
      {data.subs.map((s) => (
        <SubmissionCard key={s.id} s={s} levels={data.levels} onDone={reload} />
      ))}
    </div>
  );
}

function SubmissionCard({ s, levels, onDone }: { s: Pending; levels: ListLevel[]; onDone: () => void }) {
  const [accepting, setAccepting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function reject() {
    setErr("");
    if (!note.trim()) return setErr("Enter a reason for rejecting");
    setBusy(true);
    const { error } = await supabase.rpc("reject_level_submission", { p_id: s.id, p_note: note.trim() });
    setBusy(false);
    if (error) return setErr(errorText(error));
    onDone();
  }

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-semibold text-white">{s.name}</span>
            <span className="text-xs text-muted">
              ID {s.gd_id} · {s.fps} FPS
            </span>
          </div>
          <div className="mt-0.5 text-sm text-neutral-300">
            {s.creator} <span className="text-muted">· published by</span> {s.publisher} <span className="text-muted">· verified by</span> {s.verifier}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="text-muted">Submitted by</span>
            <Flag code={s.submitter.country} />
            <Link to={`/player/${s.submitter.username}`} className="font-medium text-white hover:text-brand">
              {s.submitter.username}
            </Link>
            <a href={`https://t.me/${s.telegram}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-muted hover:text-white">
              <BrandIcon brand="telegram" className="h-3.5 w-3.5" />@{s.telegram}
            </a>
            <span className="text-xs text-muted">· {timeAgo(s.created_at)}</span>
          </div>
          <Opinion text={s.placement} />
        </div>
        <VideoLink url={s.video_url} />
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input className="input flex-1" placeholder="Reason for rejecting" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        <div className="flex gap-2">
          <button className="btn-ghost flex-1 !text-emerald-400 sm:flex-none" disabled={busy} onClick={() => setAccepting(true)}>
            <Check className="h-4 w-4" /> Accept
          </button>
          <button className="btn-danger flex-1 sm:flex-none" disabled={busy} onClick={reject}>
            <X className="h-4 w-4" /> Reject
          </button>
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}

      {createPortal(
        <AnimatePresence>{accepting && <AcceptDialog s={s} levels={levels} onClose={() => setAccepting(false)} onDone={onDone} />}</AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

function Opinion({ text }: { text: string }) {
  return (
    <p className="mt-2 whitespace-pre-line rounded-md bg-surface-2 px-3 py-2 text-sm text-neutral-300">
      <span className="text-muted">Player's opinion on placement: </span>
      {text}
    </p>
  );
}

/** Pick the final position; the player's opinion is shown only as a reference. */
function AcceptDialog({ s, levels, onClose, onDone }: { s: Pending; levels: ListLevel[]; onClose: () => void; onDone: () => void }) {
  const total = levels.length;
  const [draft, setDraft] = useState<Draft>({
    name: s.name,
    creator: s.creator,
    verifier: s.verifier,
    gd_id: String(s.gd_id),
    video_url: s.video_url,
    fps: s.fps,
  });
  const [pos, setPos] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const n = Number(pos);
  const validPos = Number.isInteger(n) && n >= 1 && n <= total + 1;
  const above = validPos ? levels.find((l) => l.position === n - 1) : undefined;
  const below = validPos ? levels.find((l) => l.position === n) : undefined;

  async function accept() {
    setErr("");
    const v = validate(draft) ?? (!validPos ? `Choose a position from 1 to ${total + 1}` : null);
    if (v) return setErr(v);
    setBusy(true);
    const { error } = await supabase.rpc("accept_level_submission", {
      p_id: s.id,
      p_name: draft.name.trim(),
      p_creator: draft.creator.trim(),
      p_verifier: draft.verifier.trim(),
      p_gd_id: draft.gd_id ? Number(draft.gd_id) : null,
      p_video_url: draft.video_url.trim() || null,
      p_fps: draft.fps.trim() || null,
      p_position: n,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    onClose();
    onDone();
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        className="card flex w-full max-w-2xl flex-col gap-4 p-5"
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 12, opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">Add "{s.name}" to the list</h2>
          <button onClick={onClose} disabled={busy} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <DraftFields d={draft} set={setDraft} />
        <p className="-mt-2 text-xs text-muted">Publisher: {s.publisher}</p>

        <div className="rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-36">
              <label className="label">Position</label>
              <input className="input" type="number" min={1} max={total + 1} placeholder={`1–${total + 1}`} value={pos} autoFocus onChange={(e) => setPos(e.target.value)} />
            </div>
            <div className="min-w-0 flex-1 pb-2 text-sm">
              {!pos ? (
                <span className="text-muted">Choose where the level goes</span>
              ) : !validPos ? (
                <span className="text-red-400">From 1 to {total + 1}</span>
              ) : (
                <span className="text-neutral-300">
                  {above ? (
                    <>
                      below <span className="text-muted">#{above.position}</span> {above.name}
                    </>
                  ) : (
                    "top of the list"
                  )}
                  {below && (
                    <>
                      {above ? ", " : " · "}above <span className="text-muted">#{below.position}</span> {below.name}
                    </>
                  )}
                </span>
              )}
            </div>
          </div>
          <Opinion text={s.placement} />
        </div>

        <input className="input" placeholder="Note for the player (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />

        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2">
          <button className="btn-primary" disabled={busy} onClick={accept}>
            <Check className="h-4 w-4" /> {busy ? "Adding…" : "Add to list"}
          </button>
          <button className="btn-ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
