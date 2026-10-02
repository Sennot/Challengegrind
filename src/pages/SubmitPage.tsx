import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Info, Send } from "lucide-react";
import { supabase, errorText } from "../lib/supabase";
import { must, useAsync } from "../lib/useAsync";
import { useAuth } from "../lib/auth";
import type { Level } from "../lib/types";
import { isHttpsUrl } from "../lib/video";
import LevelPicker from "../components/LevelPicker";
import { ErrorBox, PageHeader, Spinner } from "../components/ui";

export default function SubmitPage() {
  const { session, profile, loading: authLoading } = useAuth();

  if (authLoading) return <Spinner />;
  if (!session || !profile) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Отправить рекорд" />
        <div className="card flex flex-col items-center gap-4 p-8 text-center">
          <p className="text-sm text-muted">Отправлять рекорды могут только зарегистрированные игроки.</p>
          <div className="flex gap-2">
            <Link to="/login" className="btn-primary">Войти</Link>
            <Link to="/register" className="btn-ghost">Регистрация</Link>
          </div>
        </div>
      </div>
    );
  }
  if (profile.banned) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Отправить рекорд" />
        <ErrorBox message={`Ваш аккаунт заблокирован${profile.ban_reason ? `: ${profile.ban_reason}` : ""}. Отправка рекордов недоступна.`} />
      </div>
    );
  }
  return <SubmitForm username={profile.username} />;
}

function SubmitForm({ username }: { username: string }) {
  const levels = useAsync(async () => must(await supabase.from("levels").select("id, name, position, creator, video_url").order("position")) as Level[], []);

  const [levelId, setLevelId] = useState<number | null>(null);
  const [video, setVideo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!levelId) return setMsg({ ok: false, text: "Выберите уровень" });
    if (!isHttpsUrl(video)) return setMsg({ ok: false, text: "Укажите ссылку на видео (https://…)" });
    setBusy(true);
    const { error } = await supabase.from("records").insert({ level_id: levelId, video_url: video.trim(), note: note.trim() || null });
    setBusy(false);
    if (error) {
      const text = error.message.includes("records_one_active_idx")
        ? "У вас уже есть рекорд на этом уровне (на проверке или принят)"
        : error.message.includes("too many pending")
          ? "Слишком много рекордов на проверке (максимум 5)"
          : errorText(error);
      return setMsg({ ok: false, text });
    }
    setMsg({ ok: true, text: "Рекорд отправлен на проверку." });
    setLevelId(null);
    setVideo("");
    setNote("");
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Отправить рекорд" subtitle="Только 100% прохождения с видео" />

      <form onSubmit={submit} className="card flex flex-col gap-4 p-5">
        <div>
          <label className="label">Уровень</label>
          {levels.loading ? <div className="input text-muted">Загрузка…</div> : <LevelPicker levels={levels.data ?? []} value={levelId} onChange={setLevelId} />}
        </div>
        <div>
          <label className="label">Ссылка на видео</label>
          <input className="input" type="url" placeholder="https://youtu.be/… или https://t.me/…" value={video} onChange={(e) => setVideo(e.target.value)} maxLength={300} />
          <p className="mt-1 text-xs text-neutral-500">YouTube или пост в Telegram.</p>
        </div>
        <div>
          <label className="label">Комментарий (необязательно)</label>
          <textarea className="input min-h-20 resize-y" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="FPS, CBF и т.п." />
        </div>

        <div className="flex gap-2.5 rounded-lg border border-line bg-surface-2 p-3 text-sm text-neutral-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <p>Raw footage не требуется, но не удаляйте его в течение 3 дней после подачи рекорда — администрация может его запросить.</p>
        </div>

        {msg && (
          <div className={`rounded-lg border p-3 text-sm ${msg.ok ? "border-emerald-500/25 text-emerald-300" : "border-red-500/25 text-red-300"}`}>
            {msg.text}{" "}
            {msg.ok && (
              <Link to={`/player/${username}`} className="underline hover:text-white">
                Статус — в профиле
              </Link>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button className="btn-primary" disabled={busy}>
            <Send className="h-4 w-4" /> {busy ? "Отправка…" : "Отправить"}
          </button>
          <Link to={`/player/${username}`} className="text-sm text-muted hover:text-white">
            Мои заявки →
          </Link>
        </div>
      </form>
    </div>
  );
}
