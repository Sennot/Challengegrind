// Admin-only password reset. Deploy: supabase functions deploy admin-reset-password
// Optional secret: ALLOWED_ORIGIN (e.g. https://challengegrind.pages.dev)
import { createClient } from "jsr:@supabase/supabase-js@2";

const RANK: Record<string, number> = { player: 0, helper: 1, moderator: 2, admin: 3, owner: 4 };

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  // Prefer the new secret key (set with `supabase secrets set SB_SECRET_KEY=sb_secret_...`);
  // fall back to the legacy service_role JWT so the function works either way.
  const serviceKey = Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return json({ error: "server misconfigured" }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Identify the caller from their access token (verified by the auth server)
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: { userId?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  const { userId, password } = body;
  if (typeof userId !== "string" || typeof password !== "string") return json({ error: "invalid body" }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: "password must be 8–72 characters" }, 400);
  if (userId === user.id) return json({ error: "use account settings to change your own password" }, 400);

  const { data: rows, error } = await admin.from("profiles").select("id, role, banned").in("id", [user.id, userId]);
  if (error) return json({ error: "lookup failed" }, 500);

  const caller = rows?.find((r) => r.id === user.id);
  const target = rows?.find((r) => r.id === userId);
  if (!caller || !target) return json({ error: "user not found" }, 404);
  // Banned staff have no powers (mirrors public.my_rank())
  const callerRank = caller.banned ? 0 : RANK[caller.role];
  if (callerRank < RANK.admin || RANK[target.role] >= callerRank) {
    return json({ error: "insufficient permissions" }, 403);
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password });
  if (updErr) return json({ error: updErr.message }, 400);

  // Kick whoever was using the account (e.g. an impostor) off every device
  const { error: revokeErr } = await admin.rpc("admin_revoke_sessions", { p_user_id: userId });
  if (revokeErr) return json({ ok: true, warning: "password changed, but sessions were not revoked" });
  return json({ ok: true });
});
