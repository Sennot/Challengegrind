import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, usernameToEmail } from "./supabase";
import { ROLE_RANK } from "./roles";
import type { Profile } from "./types";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  rank: number;
  loading: boolean;
  signIn: (username: string, password: string, captchaToken?: string) => Promise<void>;
  signUp: (username: string, password: string, captchaToken?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // The session in localStorage (incl. session.user.id) can be edited in DevTools, so it is never
  // used to decide who the user is. getUser() validates the access token with the auth server and
  // returns the real user; a forged/invalid token clears the local session.
  const loadProfile = useCallback(async (hasSession: boolean) => {
    if (!hasSession) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      setProfile(null);
      if (error?.status === 401 || error?.status === 403) await supabase.auth.signOut({ scope: "local" });
      return;
    }
    const { data: row } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
    setProfile(row as Profile | null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(Boolean(data.session));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "INITIAL_SESSION") return; // handled by getSession() above
      // Defer to avoid calling Supabase inside the auth callback
      setTimeout(() => void loadProfile(Boolean(s)), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value: AuthState = {
    session,
    profile,
    rank: profile ? ROLE_RANK[profile.role] : -1,
    loading,
    async signIn(username, password, captchaToken) {
      const { error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
        options: { captchaToken },
      });
      if (error) throw new Error(error.message === "Invalid login credentials" ? "Неверный ник или пароль" : error.message);
    },
    async signUp(username, password, captchaToken) {
      const { data: free, error: checkErr } = await supabase.rpc("username_available", { p_username: username });
      if (checkErr) throw new Error(checkErr.message);
      if (!free) throw new Error("Этот ник уже занят");
      const { error } = await supabase.auth.signUp({
        email: usernameToEmail(username),
        password,
        options: { data: { username: username.trim() }, captchaToken },
      });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    refreshProfile: () => loadProfile(Boolean(session)),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
