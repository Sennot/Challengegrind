import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Info, Send } from "lucide-react";
import { supabase, errorText } from "../lib/supabase";
import { must, useAsync } from "../lib/useAsync";
import { useAuth } from "../lib/auth";
import type { Level } from "../lib/types";
import { isHttpsUrl } from "../lib/video";
import LevelPicker from "../components/LevelPicker";
import MethodInput from "../components/MethodInput";
import { ErrorBox, PageHeader, Spinner } from "../components/ui";
import { useList } from "../lib/list";

export default function SubmitPage() {
  const { path } = useList();
  const { session, profile, loading: authLoading } = useAuth();

  if (authLoading) return <Spinner />;
  if (!session || !profile) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Submit a record" />
        <div className="card flex flex-col items-center gap-4 p-8 text-center">
          <p className="text-sm text-muted">You need an account to submit records.</p>
          <div className="flex gap-2">
            <Link to={path("/login")} className="btn-primary">Log in</Link>
            <Link to={path("/register")} className="btn-ghost">Sign up</Link>
          </div>
        </div>
      </div>
    );
  }
  if (profile.banned) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Submit a record" />
        <ErrorBox message={`Your account is banned${profile.ban_reason ? `: ${profile.ban_reason}` : ""}. You can't submit records.`} />
      </div>
    );
  }
  return <SubmitForm username={profile.username} />;
}

const FPS_RE = /^[A-Za-z0-9 /+.-]{1,20}$/;

function SubmitForm({ username }: { username: string }) {
  const { list, isScl, path } = useList();
  const levels = useAsync(
    async () => must(await supabase.from("levels").select("id, name, position, creator, video_url").eq("list", list).order("position")) as Level[],
    [list],
  );

  const [levelId, setLevelId] = useState<number | null>(null);
  const [video, setVideo] = useState("");
  const [note, setNote] = useState("");
  const [fps, setFps] = useState("");
  const [method, setMethod] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!levelId) return setMsg({ ok: false, text: "Choose a level" });
    if (!isHttpsUrl(video)) return setMsg({ ok: false, text: "Enter a video link (https://…)" });
    if (isScl && !FPS_RE.test(fps.trim())) return setMsg({ ok: false, text: "FPS: e.g. 240 or CBF" });
    if (isScl && !method.trim()) return setMsg({ ok: false, text: "Enter the click method" });
    setBusy(true);
    const { error } = await supabase
      .from("records")
      .insert({ level_id: levelId, video_url: video.trim(), note: note.trim() || null, ...(isScl && { fps: fps.trim(), method: method.trim() }) });
    setBusy(false);
    if (error) {
      const text = error.message.includes("records_one_active_idx")
        ? "You already have a record on this level (pending or accepted)"
        : error.message.includes("FPS and method")
          ? "Enter FPS and method"
          : error.message.includes("too many pending")
            ? "Too many pending records (max 5)"
            : errorText(error);
      return setMsg({ ok: false, text });
    }
    setMsg({ ok: true, text: "Record submitted." });
    setLevelId(null);
    setVideo("");
    setNote("");
    setFps("");
    setMethod("");
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={isScl ? "Submit an SCL record" : "Submit a record"} />

      <form onSubmit={submit} className="card flex flex-col gap-4 p-5">
        <div>
          <label className="label">Level</label>
          {levels.loading ? <div className="input text-muted">Loading…</div> : <LevelPicker levels={levels.data ?? []} value={levelId} onChange={setLevelId} />}
        </div>
        <div>
          <label className="label">Video link</label>
          <input className="input" type="url" placeholder="https://youtu.be/… or https://t.me/…" value={video} onChange={(e) => setVideo(e.target.value)} maxLength={300} />
          <p className="mt-1 text-xs text-neutral-500">YouTube or a Telegram post.</p>
        </div>
        {isScl && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">FPS</label>
              <input className="input" placeholder="e.g. 240 or CBF" value={fps} maxLength={20} onChange={(e) => setFps(e.target.value)} />
            </div>
            <div>
              <label className="label">Method</label>
              <MethodInput value={method} onChange={setMethod} />
            </div>
          </div>
        )}
        <div>
          <label className="label">Comment (optional)</label>
          <textarea className="input min-h-20 resize-y" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={isScl ? "Anything staff should know" : "FPS, CBF, etc."} />
        </div>

        <div className="flex gap-2.5 rounded-lg border border-line bg-surface-2 p-3 text-sm text-neutral-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <p>Raw footage isn't required, but keep it for 3 days after submitting — staff may ask for it.</p>
        </div>

        {msg && (
          <div className={`rounded-lg border p-3 text-sm ${msg.ok ? "border-emerald-500/25 text-emerald-300" : "border-red-500/25 text-red-300"}`}>
            {msg.text}{" "}
            {msg.ok && (
              <Link to={path(`/player/${username}`)} className="underline hover:text-white">
                Track it on your profile
              </Link>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button className="btn-primary" disabled={busy}>
            <Send className="h-4 w-4" /> {busy ? "Submitting…" : "Submit"}
          </button>
          <Link to={path(`/player/${username}`)} className="text-sm text-muted hover:text-white">
            My submissions →
          </Link>
        </div>
      </form>
    </div>
  );
}
