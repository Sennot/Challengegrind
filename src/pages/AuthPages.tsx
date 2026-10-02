import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Turnstile } from "@marsidev/react-turnstile";
import { KeyRound, LogIn, UserPlus } from "lucide-react";
import { useAuth } from "../lib/auth";
import { TURNSTILE_SITE_KEY, USERNAME_RE } from "../lib/supabase";

function AuthCard({ title, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex justify-center py-6 sm:py-12">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="card w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo.jpg" alt="" className="h-10 w-10 rounded-lg object-cover" />
          <div>
            <h1 className="text-xl font-semibold text-white">{title}</h1>
            <p className="text-xs text-muted">ChallengeGrind</p>
          </div>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

function Captcha({ onToken }: { onToken: (t: string) => void }) {
  if (!TURNSTILE_SITE_KEY) return null;
  return <Turnstile siteKey={TURNSTILE_SITE_KEY} onSuccess={onToken} options={{ theme: "dark" }} />;
}

export function LoginPage() {
  const { signIn, session } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState<string>();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await signIn(username, password, captcha);
      nav("/");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Log in" icon={<LogIn className="h-5 w-5" />}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className="label">Nickname</label>
          <input className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Captcha onToken={setCaptcha} />
        {err && <p className="text-sm text-red-300">{err}</p>}
        <button className="btn-primary" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
        <p className="text-center text-sm text-muted">
          No account?{" "}
          <Link to="/register" className="text-white hover:underline">Sign up</Link>
        </p>
        <p className="flex items-start gap-2 text-xs text-neutral-500">
          <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Forgot your password? Contact the staff.
        </p>
      </form>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { signUp, session } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [captcha, setCaptcha] = useState<string>();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!USERNAME_RE.test(username)) return setErr("Nickname: 3–20 characters, letters, digits and _ only");
    if (password.length < 8) return setErr("Password must be at least 8 characters");
    if (password !== password2) return setErr("Passwords don't match");
    setBusy(true);
    try {
      await signUp(username, password, captcha);
      nav("/settings");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Sign up" icon={<UserPlus className="h-5 w-5" />}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className="label">Nickname</label>
          <input className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} required />
        </div>
        <div>
          <label className="label">Repeat password</label>
          <input className="input" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} maxLength={72} required />
        </div>
        <Captcha onToken={setCaptcha} />
        {err && <p className="text-sm text-red-300">{err}</p>}
        <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link to="/login" className="text-white hover:underline">Log in</Link>
        </p>
      </form>
    </AuthCard>
  );
}
