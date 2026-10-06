import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Info, Send, UserCheck } from "lucide-react";
import { supabase, errorText } from "../lib/supabase";
import { must, useAsync } from "../lib/useAsync";
import { useAuth } from "../lib/auth";
import type { LevelSubmission, Profile } from "../lib/types";
import { timeAgo } from "../lib/time";
import { Empty, ErrorBox, PageHeader, STATUS, Spinner, VideoLink } from "../components/ui";

const TITLE = "Submit a level";
// Same rules as the database checks (migration 0009)
const VIDEO_RE = /^https:\/\/((www\.|m\.)?youtube\.com|youtu\.be|t\.me|telegram\.me)\//;
const FPS_RE = /^[A-Za-z0-9 /+.-]{1,20}$/;
const TG_RE = /^[A-Za-z0-9_]{4,32}$/;

type Draft = {
  gd_id: string;
  fps: string;
  name: string;
  creator: string;
  publisher: string;
  verifier: string;
  video_url: string;
  placement: string;
  telegram: string;
};

export default function SubmitLevelPage() {
  const { session, profile, loading: authLoading } = useAuth();

  if (authLoading) return <Spinner />;
  if (!session || !profile) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title={TITLE} />
        <div className="card flex flex-col items-center gap-4 p-8 text-center">
          <p className="text-sm text-muted">You need an account to submit levels.</p>
          <div className="flex gap-2">
            <Link to="/login" className="btn-primary">Log in</Link>
            <Link to="/register" className="btn-ghost">Sign up</Link>
          </div>
        </div>
      </div>
    );
  }
  if (profile.banned) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title={TITLE} />
        <ErrorBox message={`Your account is banned${profile.ban_reason ? `: ${profile.ban_reason}` : ""}. You can't submit levels.`} />
      </div>
    );
  }
  return <SubmitLevelForm profile={profile} />;
}

function SubmitLevelForm({ profile }: { profile: Profile }) {
  const mine = useAsync(
    async () =>
      must(await supabase.from("level_submissions").select("*").eq("submitter_id", profile.id).order("created_at", { ascending: false }).limit(20)) as LevelSubmission[],
    [profile.id],
  );

  const empty: Draft = { gd_id: "", fps: "", name: "", creator: "", publisher: "", verifier: "", video_url: "", placement: "", telegram: profile.social_telegram ?? "" };
  const [d, setD] = useState<Draft>(empty);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function validate(): string | null {
    if (!/^\d{1,12}$/.test(d.gd_id.trim()) || Number(d.gd_id) <= 0) return "Level ID must be digits only";
    if (!FPS_RE.test(d.fps.trim())) return "FPS: e.g. 240 or CBF";
    if (!d.name.trim()) return "Enter the level name";
    if (!d.creator.trim()) return "Enter the creator(s)";
    if (!d.publisher.trim()) return "Enter the publisher";
    if (!d.verifier.trim()) return "Enter the verifier";
    if (!VIDEO_RE.test(d.video_url.trim())) return "Verification must be a YouTube or Telegram link (https://…)";
    if (!d.placement.trim()) return "Tell us where you think the level should be placed";
    if (!TG_RE.test(cleanTelegram(d.telegram))) return "Telegram username: 4–32 characters, letters, digits, _";
    return null;
  }

  const isMe = d.verifier.trim().toLowerCase() === profile.username.toLowerCase();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const v = validate();
    if (v) return setMsg({ ok: false, text: v });
    setBusy(true);
    const { error } = await supabase.from("level_submissions").insert({
      gd_id: Number(d.gd_id),
      fps: d.fps.trim(),
      name: d.name.trim(),
      creator: d.creator.trim(),
      publisher: d.publisher.trim(),
      verifier: d.verifier.trim(),
      video_url: d.video_url.trim(),
      placement: d.placement.trim(),
      telegram: cleanTelegram(d.telegram),
    });
    setBusy(false);
    if (error) {
      const text = error.message.includes("level_submissions_one_pending_idx")
        ? "You already have a pending submission of this level"
        : error.message.includes("already on the list")
          ? "This level is already on the list"
          : error.message.includes("too many pending")
            ? "Too many pending level submissions (max 3)"
            : errorText(error);
      return setMsg({ ok: false, text });
    }
    setMsg({ ok: true, text: "Level submitted. Staff will review it soon." });
    setD({ ...empty, telegram: d.telegram });
    void mine.reload();
  }

  async function withdraw(id: number) {
    if (!confirm("Withdraw this submission?")) return;
    const { error } = await supabase.from("level_submissions").delete().eq("id", id);
    if (error) return alert(errorText(error));
    void mine.reload();
  }

  const f = (k: keyof Draft, label: string, ph: string, hint?: string) => (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={d[k]} placeholder={ph} maxLength={k === "video_url" ? 300 : k === "creator" ? 128 : 64} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={TITLE} />

      <form onSubmit={submit} className="card flex flex-col gap-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {f("gd_id", "Level ID", "e.g. 12345678")}
          {f("fps", "FPS", "e.g. 240 or CBF")}
        </div>
        {f("name", "Level name", "Level name")}
        <div className="grid gap-4 sm:grid-cols-2">
          {f("creator", "Creator(s)", "e.g. Player1, Player2")}
          {f("publisher", "Publisher", "Account that uploaded the level")}
        </div>
        <div>
          <label className="label">Verifier</label>
          <div className="flex gap-2">
            <input className="input flex-1" value={d.verifier} placeholder="Who verified the level" maxLength={64} onChange={(e) => setD({ ...d, verifier: e.target.value })} />
            <button
              type="button"
              className={`btn-ghost shrink-0 ${isMe ? "!border-brand/40 !text-brand" : ""}`}
              onClick={() => setD({ ...d, verifier: isMe ? "" : profile.username })}
              title="Submit as the verifier of this level"
            >
              <UserCheck className="h-4 w-4" /> {isMe ? "It's me" : "I verified it"}
            </button>
          </div>
          <p className="mt-1 text-xs text-neutral-500">The verifier gets points for the level once it's on the list.</p>
        </div>
        {f("video_url", "Verification video", "https://youtu.be/… or https://t.me/…", "YouTube or a Telegram post.")}
        <div>
          <label className="label">Opinion on placement</label>
          <textarea
            className="input min-h-20 resize-y"
            value={d.placement}
            onChange={(e) => setD({ ...d, placement: e.target.value })}
            maxLength={500}
            placeholder="e.g. around #15, harder than X but easier than Y"
          />
        </div>
        {f("telegram", "Telegram username", "username (without @)", "Staff will contact you here if they have questions.")}

        <div className="flex gap-2.5 rounded-lg border border-line bg-surface-2 p-3 text-sm text-neutral-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <p>Your Telegram username is visible only to you and the list staff.</p>
        </div>

        {msg && <div className={`rounded-lg border p-3 text-sm ${msg.ok ? "border-emerald-500/25 text-emerald-300" : "border-red-500/25 text-red-300"}`}>{msg.text}</div>}

        <div>
          <button className="btn-primary" disabled={busy}>
            <Send className="h-4 w-4" /> {busy ? "Submitting…" : "Submit"}
          </button>
        </div>
      </form>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-muted">My level submissions</h2>
        {mine.loading ? (
          <Spinner className="!py-8" />
        ) : mine.error ? (
          <ErrorBox message={mine.error} />
        ) : !mine.data?.length ? (
          <Empty>No submissions yet</Empty>
        ) : (
          <div className="card divide-y divide-line">
            {mine.data.map((s) => {
              const st = STATUS[s.status];
              const Icon = st.icon;
              return (
                <div key={s.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1 truncate text-sm">
                      {s.level_id ? (
                        <Link to={`/level/${s.level_id}`} className="font-medium text-white hover:text-brand">
                          {s.name}
                        </Link>
                      ) : (
                        <span className="font-medium text-white">{s.name}</span>
                      )}{" "}
                      <span className="text-muted">· {s.fps}</span>
                    </div>
                    <span className="hidden text-xs text-neutral-600 sm:inline">{timeAgo(s.created_at)}</span>
                    <span className={`flex items-center gap-1 text-xs ${st.cls}`} title={st.label}>
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{st.label}</span>
                    </span>
                    <VideoLink url={s.video_url} />
                  </div>
                  {s.review_note && <p className={`mt-1 text-xs ${s.status === "rejected" ? "text-red-300" : "text-muted"}`}>Staff note: {s.review_note}</p>}
                  {s.status === "pending" && (
                    <button onClick={() => withdraw(s.id)} className="mt-1 text-xs text-muted hover:text-red-400">
                      Withdraw
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const cleanTelegram = (s: string) => s.trim().replace(/^@/, "").replace(/^https:\/\/t\.me\//, "");
