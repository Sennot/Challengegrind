import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { KeyRound, Save } from "lucide-react";
import { supabase, errorText } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { COUNTRIES } from "../lib/countries";
import { BrandIcon, ErrorBox, Flag, PageHeader, Spinner, type Brand } from "../components/ui";

type SocialForm = { telegram: string; discord: string; youtube: string; twitch: string };

const SOCIAL_FIELDS: { key: keyof SocialForm; brand: Brand; label: string; ph: string; re: RegExp; hint: string }[] = [
  { key: "telegram", brand: "telegram", label: "Telegram", ph: "username (без @)", re: /^[A-Za-z0-9_]{4,32}$/, hint: "Ник Telegram: 4–32 символа, латиница, цифры, _" },
  { key: "discord", brand: "discord", label: "Discord", ph: "username", re: /^[a-z0-9_.]{2,32}$/, hint: "Ник Discord: строчные буквы, цифры, _ и ." },
  { key: "youtube", brand: "youtube", label: "YouTube", ph: "https://youtube.com/@канал", re: /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\/.{1,180}$/, hint: "Ссылка на канал YouTube" },
  { key: "twitch", brand: "twitch", label: "Twitch", ph: "username", re: /^[A-Za-z0-9_]{3,25}$/, hint: "Ник Twitch: 3–25 символов" },
];

export default function SettingsPage() {
  const { profile, loading, refreshProfile } = useAuth();
  const [country, setCountry] = useState("");
  const [bio, setBio] = useState("");
  const [social, setSocial] = useState<SocialForm>({ telegram: "", discord: "", youtube: "", twitch: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  useEffect(() => {
    if (!profile) return;
    setCountry(profile.country ?? "");
    setBio(profile.bio ?? "");
    setSocial({
      telegram: profile.social_telegram ?? "",
      discord: profile.social_discord ?? "",
      youtube: profile.social_youtube ?? "",
      twitch: profile.social_twitch ?? "",
    });
  }, [profile]);

  if (loading) return <Spinner />;
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.banned) return <ErrorBox message="Аккаунт заблокирован — редактирование профиля недоступно." />;

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const clean = {
      telegram: social.telegram.trim().replace(/^@/, "").replace(/^https:\/\/t\.me\//, ""),
      discord: social.discord.trim().toLowerCase(),
      youtube: social.youtube.trim(),
      twitch: social.twitch.trim().replace(/^https:\/\/(www\.)?twitch\.tv\//, ""),
    };
    for (const f of SOCIAL_FIELDS) {
      if (clean[f.key] && !f.re.test(clean[f.key])) return setMsg({ ok: false, text: f.hint });
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        country: country || null,
        bio: bio.trim() || null,
        social_telegram: clean.telegram || null,
        social_discord: clean.discord || null,
        social_youtube: clean.youtube || null,
        social_twitch: clean.twitch || null,
      })
      .eq("id", profile!.id);
    setMsg(error ? { ok: false, text: errorText(error) } : { ok: true, text: "Сохранено" });
    if (!error) {
      setSocial(clean);
      void refreshProfile();
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setPwMsg("Минимум 8 символов");
    if (pw !== pw2) return setPwMsg("Пароли не совпадают");
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwMsg(error ? errorText(error) : "Пароль изменён");
    if (!error) {
      setPw("");
      setPw2("");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Настройки" subtitle={profile.username} />
      <div className="flex flex-col gap-4">
        <form onSubmit={saveProfile} className="card flex flex-col gap-4 p-5">
          <h2 className="font-medium text-white">Профиль</h2>
          <div>
            <label className="label">Страна</label>
            <div className="flex items-center gap-3">
              <Flag code={country || null} className="text-2xl" />
              <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">Не указана (международный флаг)</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">О себе</label>
            <textarea className="input min-h-24 resize-y" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} />
            <p className="mt-1 text-right text-xs text-neutral-600">{bio.length}/300</p>
          </div>

          <div>
            <label className="label">Соцсети</label>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {SOCIAL_FIELDS.map((f) => (
                <div key={f.key} className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" title={f.label}>
                    <BrandIcon brand={f.brand} />
                  </span>
                  <input
                    className="input pl-10"
                    placeholder={f.ph}
                    value={social[f.key]}
                    maxLength={200}
                    onChange={(e) => setSocial({ ...social, [f.key]: e.target.value })}
                    aria-label={f.label}
                  />
                </div>
              ))}
            </div>
          </div>

          {msg && <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
          <button className="btn-primary self-start">
            <Save className="h-4 w-4" /> Сохранить
          </button>
        </form>

        <form onSubmit={changePassword} className="card flex flex-col gap-4 p-5">
          <h2 className="font-medium text-white">Смена пароля</h2>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <input className="input" type="password" placeholder="Новый пароль" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} maxLength={72} />
            <input className="input" type="password" placeholder="Повторите пароль" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} maxLength={72} />
          </div>
          {pwMsg && <p className="text-sm text-muted">{pwMsg}</p>}
          <button className="btn-ghost self-start">
            <KeyRound className="h-4 w-4" /> Изменить пароль
          </button>
        </form>
      </div>
    </div>
  );
}
