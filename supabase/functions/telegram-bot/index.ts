// ChallengeGrind Telegram bot (@challengegrind_bot). Deploy with verify_jwt = false.
// Two kinds of requests:
//   • Telegram webhook updates  — header X-Telegram-Bot-Api-Secret-Token = TG_WEBHOOK_SECRET
//   • database events (pg_net)  — header x-internal-secret = TG_INTERNAL_SECRET, body { type, id }
// Secrets: TELEGRAM_BOT_TOKEN, TG_WEBHOOK_SECRET, TG_INTERNAL_SECRET, SITE_URL (optional), BOT_USERNAME (optional).
// Chat ids live in public.telegram_config (group_chat_id, changelog_thread_id, staff_chat_id, staff_thread_id).
import { createClient } from "jsr:@supabase/supabase-js@2";

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const WEBHOOK_SECRET = Deno.env.get("TG_WEBHOOK_SECRET") ?? "";
const INTERNAL_SECRET = Deno.env.get("TG_INTERNAL_SECRET") ?? "";
const SITE = (Deno.env.get("SITE_URL") ?? "https://challengegrind.pages.dev").replace(/\/$/, "");
const BOT = Deno.env.get("BOT_USERNAME") ?? "challengegrind_bot";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const RANK: Record<string, number> = { player: 0, helper: 1, moderator: 2, admin: 3, owner: 4 };
const ROLE_LABEL: Record<string, string> = { player: "Player", helper: "List Helper", moderator: "List Moderator", admin: "List Admin", owner: "Owner" };
const LOGIN_TRIES_PER_HOUR = 5;
const COOLDOWN_MS = 2000;
const PAGE = 8;

// ---------------------------------------------------------------- helpers

// deno-lint-ignore no-explicit-any
type Json = any;

async function tg(method: string, body: Record<string, unknown>): Promise<Json | null> {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => null);
  if (!j?.ok) {
    if (!String(j?.description ?? "").includes("message is not modified")) console.error(method, j?.description);
    return null;
  }
  return j.result;
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const points = (pos: number) => Math.round(100 * Math.pow(0.965, pos - 1) * 100) / 100;
const fmt = (n: number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const fpsLabel = (fps: string) => (/^\d+$/.test(fps) ? `${fps} FPS` : fps);
const flag = (code?: string | null) =>
  code && /^[a-z]{2}$/.test(code) ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "🏳️";
const like = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const btn = (text: string, url: string) => ({ text, url });
const cb = (text: string, data: string) => ({ text, callback_data: data });

/** Callback data is limited to 64 bytes */
function fitBytes(prefix: string, s: string) {
  const enc = new TextEncoder();
  let out = s;
  while (enc.encode(prefix + out).length > 64) out = out.slice(0, -1);
  return prefix + out;
}

function youtubeId(url?: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m)\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com") id = u.pathname === "/watch" ? u.searchParams.get("v") : (u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1] ?? null);
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Link preview of the level's video above the text (or none) */
const preview = (video?: string | null) =>
  video ? { url: video, prefer_large_media: true, show_above_text: true } : { is_disabled: true };

async function config(): Promise<Record<string, string>> {
  const { data } = await db.from("telegram_config").select("key, value");
  return Object.fromEntries((data ?? []).map((r: Json) => [r.key, r.value]));
}

async function hits(key: string, seconds: number) {
  const since = new Date(Date.now() - seconds * 1000).toISOString();
  const { count } = await db.from("telegram_rate").select("key", { count: "exact", head: true }).eq("key", key).gte("at", since);
  return count ?? 0;
}
async function hit(key: string) {
  await db.from("telegram_rate").insert({ key });
  if (Math.random() < 0.05) await db.from("telegram_rate").delete().lt("at", new Date(Date.now() - 86400_000).toISOString());
}

async function getState(tgUser: number) {
  const { data } = await db.from("telegram_state").select("*").eq("tg_user_id", tgUser).maybeSingle();
  const ttl = data?.step?.startsWith("submit_") ? 30 : 15; // minutes
  if (data && Date.now() - new Date(data.updated_at).getTime() > ttl * 60_000) {
    await clearState(tgUser);
    return null;
  }
  return data as { step: string; data: Json } | null;
}
const setState = (tgUser: number, step: string, data: Json = {}) =>
  db.from("telegram_state").upsert({ tg_user_id: tgUser, step, data, updated_at: new Date().toISOString() });
const clearState = (tgUser: number) => db.from("telegram_state").delete().eq("tg_user_id", tgUser);

/** Site account linked to a Telegram user, with role */
async function account(tgUser: number) {
  const { data: link } = await db.from("telegram_links").select("user_id, notify").eq("tg_user_id", tgUser).maybeSingle();
  if (!link) return null;
  const { data: p } = await db.from("profiles").select("id, username, role, banned, country").eq("id", link.user_id).maybeSingle();
  if (!p) return null;
  return { ...p, notify: link.notify as boolean, rank: p.banned ? 0 : (RANK[p.role] ?? 0) };
}

// ---------------------------------------------------------------- cards

type Level = { id: number; name: string; creator: string; verifier: string; position: number; fps: string | null; gd_id: number | null; video_url: string | null };
const LEVEL_COLS = "id, name, creator, verifier, position, fps, gd_id, video_url";

/** Levels the linked account has (accepted records + verifications); empty for strangers */
async function doneLevels(tgUser?: number): Promise<Set<number>> {
  if (!tgUser) return new Set();
  const { data: link } = await db.from("telegram_links").select("user_id").eq("tg_user_id", tgUser).maybeSingle();
  if (!link) return new Set();
  const [{ data: rec }, { data: ver }] = await Promise.all([
    db.from("records").select("level_id").eq("player_id", link.user_id).eq("status", "approved"),
    db.from("levels").select("id").eq("verifier_id", link.user_id),
  ]);
  return new Set([...(rec ?? []).map((r: Json) => Number(r.level_id)), ...(ver ?? []).map((l: Json) => Number(l.id))]);
}

/** ▰▰▰▱▱ */
const bar = (n: number, total: number, width = 10) => {
  const full = total ? Math.round((n / total) * width) : 0;
  return "▰".repeat(full) + "▱".repeat(width - full);
};
const MEDAL = ["🥇", "🥈", "🥉"];
const padL = (s: string | number, n: number) => String(s).padStart(n, " ");

async function levelCard(l: Level, viewer?: number) {
  const [{ data: rec }, { data: pl }, done] = await Promise.all([
    db.from("records").select("player:profiles!records_player_id_fkey(banned)").eq("level_id", l.id).eq("status", "approved"),
    db.from("pack_levels").select("pack:packs(name)").eq("level_id", l.id),
    doneLevels(viewer),
  ]);
  const victors = (rec ?? []).filter((r: Json) => !r.player?.banned).length;
  const packs = (pl ?? []).map((p: Json) => p.pack?.name).filter(Boolean);
  const stats = [
    `🏆 <b>${fmt(points(l.position))}</b> points`,
    l.fps ? `🎮 ${esc(fpsLabel(l.fps))}` : null,
    `👥 ${victors} victor${victors === 1 ? "" : "s"}`,
    packs.length ? `📦 ${packs.map(esc).join(", ")}` : null,
    l.gd_id ? `🆔 <code>${l.gd_id}</code>` : null,
  ].filter((x) => x !== null);
  const lines = [
    `${MEDAL[l.position - 1] ?? "🔹"} <b>#${l.position} · ${esc(l.name)}</b>`,
    `<i>by ${esc(l.creator)} · verified by ${esc(l.verifier)}</i>`,
    `<blockquote>${stats.join("\n")}</blockquote>`,
    done.has(Number(l.id)) ? "✅ <b>You completed this level</b>" : null,
  ].filter((x) => x !== null);
  const row = [btn("🌐 Open on site", `${SITE}/level/${l.id}`)];
  if (l.video_url) row.push(btn("▶️ Video", l.video_url));
  return { text: lines.join("\n"), parse_mode: "HTML", link_preview_options: preview(l.video_url), reply_markup: { inline_keyboard: [row] } };
}

async function playerCard(name: string) {
  const { data: p } = await db.from("profiles").select("id, username, country, role, banned").ilike("username", like(name)).maybeSingle();
  const { data: row } = p
    ? await db.from("leaderboard").select("*").eq("id", p.id).maybeSingle()
    : await db.from("leaderboard").select("*").eq("registered", false).eq("username", name).maybeSingle();
  if (!p && !row) return null;
  const username = p?.username ?? row.username;
  const stats = row
    ? [
        `🏅 Rank <b>#${row.rank}</b> · <b>${fmt(row.points)}</b> points`,
        `✅ ${row.completions} completed${row.verifications ? ` · ${row.verifications} verified` : ""}`,
        row.hardest_name ? `💀 Hardest: #${row.hardest_position} ${esc(row.hardest_name)}` : null,
        row.packs_completed ? `📦 ${row.packs_completed} pack${row.packs_completed === 1 ? "" : "s"} · +${fmt(row.pack_bonus)} bonus` : null,
      ].filter((x) => x !== null)
    : ["No points yet"];
  const lines = [
    `${flag(p?.country)} <b>${esc(username)}</b>${row && MEDAL[row.rank - 1] ? ` ${MEDAL[row.rank - 1]}` : ""}`,
    `<i>${p ? ROLE_LABEL[p.role] : "No account yet"}${p?.banned ? " · banned" : ""}</i>`,
    `<blockquote>${stats.join("\n")}</blockquote>`,
  ];
  return {
    text: lines.join("\n"),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [[btn("🌐 Profile", `${SITE}/player/${encodeURIComponent(username)}`)]] },
  };
}

async function packCard(id: number, viewer?: number) {
  const [{ data: p }, done] = await Promise.all([
    db.from("packs").select("id, name, bonus_points, pack_levels(level:levels(id, name, position))").eq("id", id).maybeSingle(),
    doneLevels(viewer),
  ]);
  if (!p) return null;
  const levels = (p.pack_levels ?? []).map((x: Json) => x.level).filter(Boolean).sort((a: Json, b: Json) => a.position - b.position);
  const have = levels.filter((l: Json) => done.has(Number(l.id))).length;
  const mark = (l: Json) => (done.size && done.has(Number(l.id)) ? "✅" : "▫️");
  const lines = [
    `📦 <b>${esc(p.name)}</b>`,
    `<i>${levels.length} level${levels.length === 1 ? "" : "s"}${Number(p.bonus_points) > 0 ? ` · +${fmt(p.bonus_points)} bonus points` : ""}</i>`,
    "",
    ...levels.map((l: Json) => `${mark(l)} <code>#${padL(l.position, 2)}</code> <a href="${SITE}/level/${l.id}">${esc(l.name)}</a>`),
    done.size ? `\n${bar(have, levels.length)} <b>${have}/${levels.length}</b>${have === levels.length && levels.length ? " · completed! 🎉" : ""}` : null,
  ].filter((x) => x !== null);
  return { text: lines.join("\n"), parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [[btn("🌐 All packs", `${SITE}/packs`)]] } };
}

const TOP_PAGE = 10;
const pager = (prefix: string, page: number, pages: number) => {
  if (pages <= 1) return [];
  return [[
    ...(page > 0 ? [cb("◀️", `${prefix}:${page - 1}`)] : []),
    cb(`${page + 1} / ${pages}`, "noop"),
    ...(page < pages - 1 ? [cb("▶️", `${prefix}:${page + 1}`)] : []),
  ]];
};

/** Top levels, TOP_PAGE per page: aligned position + points, medals for the top 3 */
async function topPage(page: number) {
  const { count } = await db.from("levels").select("id", { count: "exact", head: true });
  const pages = Math.max(1, Math.ceil((count ?? 0) / TOP_PAGE));
  page = Math.min(Math.max(page, 0), pages - 1);
  const { data } = await db.from("levels").select("id, name, position").order("position").range(page * TOP_PAGE, page * TOP_PAGE + TOP_PAGE - 1);
  if (!data?.length) return { text: "The list is empty." };
  const lines = data.map(
    (l: Json) => `<code>${padL(l.position, 3)} │ ${padL(fmt(points(l.position)), 6)}</code>  <a href="${SITE}/level/${l.id}">${esc(l.name)}</a>${MEDAL[l.position - 1] ? ` ${MEDAL[l.position - 1]}` : ""}`,
  );
  return {
    text: `🏆 <b>Top levels</b> · #${data[0].position}–${data[data.length - 1].position} of ${count}\n\n${lines.join("\n")}`,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [...pager("tp", page, pages), [btn("🌐 Full list", SITE)]] },
  };
}

/** Top players, TOP_PAGE per page */
async function playersPage(page: number) {
  const { count } = await db.from("leaderboard").select("username", { count: "exact", head: true });
  const pages = Math.max(1, Math.ceil((count ?? 0) / TOP_PAGE));
  page = Math.min(Math.max(page, 0), pages - 1);
  const { data } = await db
    .from("leaderboard")
    .select("username, country, points, rank")
    .order("rank")
    .order("username")
    .range(page * TOP_PAGE, page * TOP_PAGE + TOP_PAGE - 1);
  if (!data?.length) return { text: "No players with points yet." };
  const lines = data.map(
    (p: Json) =>
      `<code>${padL(p.rank, 3)} │ ${padL(fmt(p.points), 7)}</code>  ${flag(p.country)} <a href="${SITE}/player/${encodeURIComponent(p.username)}">${esc(p.username)}</a>${MEDAL[p.rank - 1] ? ` ${MEDAL[p.rank - 1]}` : ""}`,
  );
  return {
    text: `🏅 <b>Top players</b> · page ${page + 1} of ${pages}\n\n${lines.join("\n")}`,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [...pager("pp", page, pages), [btn("🌐 Stats Viewer", `${SITE}/stats`)]] },
  };
}

/** "#5" → position, big numbers → GD level id, otherwise exact name, then partial name */
async function findLevels(q: string): Promise<Level[]> {
  q = q.trim();
  const num = q.match(/^#?(\d{1,12})$/);
  if (num) {
    const n = Number(num[1]);
    const { count } = await db.from("levels").select("id", { count: "exact", head: true });
    const byPos = q.startsWith("#") || n <= (count ?? 0);
    const { data } = await db.from("levels").select(LEVEL_COLS).eq(byPos ? "position" : "gd_id", n);
    if (data?.length) return data as Level[];
  }
  const { data: exact } = await db.from("levels").select(LEVEL_COLS).ilike("name", like(q)).order("position");
  if (exact?.length) return exact as Level[];
  const { data: part } = await db.from("levels").select(LEVEL_COLS).ilike("name", `%${like(q)}%`).order("position").limit(PAGE + 1);
  return (part ?? []) as Level[];
}

/** Search by name or creator, PAGE per page with buttons */
async function searchPage(q: string, page: number) {
  const pat = `%${like(q)}%`;
  const [{ data: byName }, { data: byCreator }] = await Promise.all([
    db.from("levels").select("id, name, creator, position").ilike("name", pat),
    db.from("levels").select("id, name, creator, position").ilike("creator", pat),
  ]);
  const all = [...new Map([...(byName ?? []), ...(byCreator ?? [])].map((l: Json) => [l.id, l])).values()].sort((a: Json, b: Json) => a.position - b.position);
  if (!all.length) return { text: `Nothing found for “${esc(q)}”.`, parse_mode: "HTML" };
  const pages = Math.ceil(all.length / PAGE);
  page = Math.min(Math.max(page, 0), pages - 1);
  const slice = all.slice(page * PAGE, page * PAGE + PAGE);
  const rows: Json[] = slice.map((l: Json) => [cb(`#${l.position} ${l.name} — ${l.creator}`.slice(0, 60), `lv:${l.id}`)]);
  const nav: Json[] = [];
  if (page > 0) nav.push(cb("◀️ Back", fitBytes(`q:${page - 1}:`, q)));
  if (page < pages - 1) nav.push(cb("Next ▶️", fitBytes(`q:${page + 1}:`, q)));
  if (nav.length) rows.push(nav);
  return {
    text: `🔎 <b>${all.length}</b> result${all.length === 1 ? "" : "s"} for “${esc(q)}”${pages > 1 ? ` · page ${page + 1}/${pages}` : ""}`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows },
  };
}

// ---------------------------------------------------------------- commands

const HELP = [
  "<b>ChallengeGrind bot</b>",
  "",
  "/top [page] — top levels",
  "/level &lt;name | #position | level id&gt; — level card",
  "/search &lt;text&gt; — find levels by name or creator",
  "/players [page] — top players",
  "/player &lt;nickname&gt; — player stats",
  "/packs — all packs · /pack &lt;name&gt; — one pack",
  "/random — a random level",
  "",
  "<b>In private messages</b>",
  "/login — link your site account (site notifications come here)",
  "/submit — submit a record · /submitlevel — submit a level",
  "/me — your stats · /notify on|off · /logout",
].join("\n");

async function onMessage(m: Json) {
  const from = m.from;
  if (!from || from.is_bot) return;
  const chat = m.chat;
  const isPrivate = chat.type === "private";
  const text: string = (m.text ?? "").trim();
  const thread = m.is_topic_message ? m.message_thread_id : undefined;
  const reply = (body: Json) =>
    tg("sendMessage", { chat_id: chat.id, message_thread_id: thread, reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true }, ...body });
  const say = (html: string, extra: Json = {}) => reply({ text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra });

  const state = await getState(from.id);

  // Password typed outside the DM while logging in: remove it at once
  if (state?.step === "login_password" && !isPrivate && text && !text.startsWith("/")) {
    await tg("deleteMessage", { chat_id: chat.id, message_id: m.message_id });
    await tg("sendMessage", { chat_id: chat.id, message_thread_id: thread, text: "⚠️ Never send passwords in a group — I deleted that message. Log in in private messages." });
    await clearState(from.id);
    await tg("sendMessage", {
      chat_id: from.id,
      text: "You sent your password in a group chat. I deleted it, but someone may have seen it — please change your password on the site, then send /login again.",
    });
    return;
  }

  const cmd = text.match(/^\/([a-z_]+)(?:@(\w+))?(?:\s+([\s\S]*))?$/i);
  if (cmd) {
    if (cmd[2] && cmd[2].toLowerCase() !== BOT.toLowerCase()) return; // another bot's command
    const name = cmd[1].toLowerCase();
    const arg = (cmd[3] ?? "").trim();
    if (state && name !== "cancel" && name !== "skip") await clearState(from.id);

    // cooldown for public commands in groups
    if (!isPrivate && !["login", "cancel", "setstaff"].includes(name)) {
      if (await hits(`chat:${chat.id}`, COOLDOWN_MS / 1000)) return;
      await hit(`chat:${chat.id}`);
    }
    return command(name, arg, { m, from, chat, isPrivate, reply, say, state });
  }

  // Multi-step conversations
  if (!state || !text) return;
  if (isPrivate && state.step === "submit_record") return recordInput(from, text, dm(chat.id));
  if (isPrivate && state.step === "submit_level") return levelInput(from, text, dm(chat.id));
  if (state.step === "login_username" && isPrivate) {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(text)) return say("That doesn't look like a nickname (3–20 letters, digits, _). Try again or /cancel.");
    await setState(from.id, "login_password", { username: text });
    return say("Now send your <b>password</b>. I'll delete the message right away.");
  }
  if (state.step === "login_password" && isPrivate) {
    await tg("deleteMessage", { chat_id: chat.id, message_id: m.message_id });
    return login(from, state.data.username, text, say);
  }
  if ((state.step === "reject_record" || state.step === "reject_submission") && chat.id === state.data.chat_id) {
    return rejectWithReason(from, state, text, m);
  }
}

type Ctx = { m: Json; from: Json; chat: Json; isPrivate: boolean; reply: (b: Json) => Promise<Json>; say: (h: string, e?: Json) => Promise<Json>; state: Json };

async function command(name: string, arg: string, c: Ctx) {
  const { from, isPrivate, reply, say } = c;
  switch (name) {
    case "start":
      if (isPrivate && arg === "login") return command("login", "", c);
      if (isPrivate && arg === "submit") return command("submit", "", c);
      if (isPrivate && arg === "submitlevel") return command("submitlevel", "", c);
      return say(HELP);
    case "help":
      return say(HELP);
    case "cancel":
      await clearState(from.id);
      return say("Cancelled.");

    case "login": {
      if (!isPrivate) {
        return say("Log in in private messages — never send your password in a group.", {
          reply_markup: { inline_keyboard: [[btn("🔐 Log in", `https://t.me/${BOT}?start=login`)]] },
        });
      }
      const acc = await account(from.id);
      await setState(from.id, "login_username");
      return say(`${acc ? `You're logged in as <b>${esc(acc.username)}</b>. Logging in again will switch accounts.\n\n` : ""}Send your <b>nickname</b> on ChallengeGrind (or /cancel).`);
    }
    case "logout": {
      const { count } = await db.from("telegram_links").delete({ count: "exact" }).eq("tg_user_id", from.id);
      return say(count ? "Logged out. You won't get site notifications here anymore." : "You're not logged in.");
    }
    case "me": {
      const acc = await account(from.id);
      if (!acc) return say("You're not logged in. Use /login in private messages.");
      return reply((await playerCard(acc.username)) ?? { text: "Profile not found." });
    }
    case "notify": {
      const acc = await account(from.id);
      if (!acc) return say("Log in first: /login (in private messages).");
      const on = arg.toLowerCase() === "on" ? true : arg.toLowerCase() === "off" ? false : !acc.notify;
      await db.from("telegram_links").update({ notify: on }).eq("tg_user_id", from.id);
      return say(on ? "🔔 Notifications are on." : "🔕 Notifications are off. /notify on to turn them back on.");
    }

    case "top":
      // /top or /top 3 (page number)
      return reply(await topPage((Number(arg) || 1) - 1));
    case "level": {
      if (!arg) return say("Usage: /level &lt;name | #position | level id&gt;");
      const found = await findLevels(arg);
      if (!found.length) return say(`No level matches “${esc(arg)}”. Try /search ${esc(arg)}`);
      if (found.length === 1) return reply(await levelCard(found[0], from.id));
      // several levels share the name → let the user pick
      const rows = found.slice(0, PAGE).map((l) => [cb(`#${l.position} ${l.name} — ${l.creator}`.slice(0, 60), `lv:${l.id}`)]);
      return say(`Several levels match “${esc(arg)}” — pick one:${found.length > PAGE ? `\n(showing the first ${PAGE}, use /search for more)` : ""}`, {
        reply_markup: { inline_keyboard: rows },
      });
    }
    case "search": {
      if (!arg) return say("Usage: /search &lt;name or creator&gt;");
      return reply(await searchPage(arg.slice(0, 40), 0));
    }
    case "random": {
      const { count } = await db.from("levels").select("id", { count: "exact", head: true });
      if (!count) return say("The list is empty.");
      const { data } = await db.from("levels").select(LEVEL_COLS).eq("position", 1 + Math.floor(Math.random() * count)).maybeSingle();
      return data ? reply(await levelCard(data as Level, from.id)) : say("Try again.");
    }
    case "players":
      return reply(await playersPage((Number(arg) || 1) - 1));
    case "player": {
      if (!arg) {
        const acc = await account(from.id);
        if (!acc) return say("Usage: /player &lt;nickname&gt;");
        arg = acc.username;
      }
      const card = await playerCard(arg.replace(/^@/, ""));
      return card ? reply(card) : say(`No player called “${esc(arg)}”.`);
    }
    case "packs": {
      const { data } = await db.from("packs").select("id, name, bonus_points, pack_levels(level_id)").order("created_at");
      if (!data?.length) return say("No packs yet.");
      const lines = data.map((p: Json) => `📦 <b>${esc(p.name)}</b> — ${p.pack_levels.length} levels${Number(p.bonus_points) > 0 ? `, +${fmt(p.bonus_points)}` : ""}`);
      const rows = data.slice(0, 20).map((p: Json) => [cb(`📦 ${p.name}`.slice(0, 60), `pk:${p.id}`)]);
      return say(`<b>Packs</b>\n\n${lines.join("\n")}`, { reply_markup: { inline_keyboard: [...rows, [btn("🌐 Packs on site", `${SITE}/packs`)]] } });
    }
    case "pack": {
      if (!arg) return command("packs", "", c);
      const { data } = await db.from("packs").select("id, name").ilike("name", `%${like(arg)}%`).order("created_at").limit(10);
      if (!data?.length) return say(`No pack matches “${esc(arg)}”.`);
      const exact = data.find((p: Json) => p.name.toLowerCase() === arg.toLowerCase());
      if (exact || data.length === 1) return reply((await packCard((exact ?? data[0]).id, from.id))!);
      return say("Several packs match — pick one:", { reply_markup: { inline_keyboard: data.map((p: Json) => [cb(`📦 ${p.name}`.slice(0, 60), `pk:${p.id}`)]) } });
    }
    case "submit":
    case "submitlevel": {
      if (!isPrivate) {
        return say(name === "submit" ? "Submit records in private messages:" : "Submit levels in private messages:", {
          reply_markup: { inline_keyboard: [[btn(name === "submit" ? "📨 Submit a record" : "🆕 Submit a level", `https://t.me/${BOT}?start=${name}`)]] },
        });
      }
      return name === "submit" ? startRecord(from, arg, dm(c.chat.id)) : startLevel(from, dm(c.chat.id));
    }
    case "skip": {
      const st = c.state;
      if (isPrivate && st?.step === "submit_record" && st.data.stage === "note") return recordInput(from, null, dm(c.chat.id));
      return say("Nothing to skip here.");
    }
    case "setstaff": {
      // List Admin+ (logged in to the bot) marks this chat / topic as the staff chat
      if (isPrivate) return say("Send /setstaff in the staff chat (inside the topic, if it's a forum).");
      const acc = await account(from.id);
      if (!acc || acc.rank < 3) return say("Only List Admin+ can do this — log in to the bot in private messages first (/login).");
      const thread = c.m.is_topic_message ? String(c.m.message_thread_id) : null;
      await db.from("telegram_config").upsert({ key: "staff_chat_id", value: String(c.chat.id) });
      if (thread) await db.from("telegram_config").upsert({ key: "staff_thread_id", value: thread });
      else await db.from("telegram_config").delete().eq("key", "staff_thread_id");
      return say("✅ This is now the staff chat: new records (with Accept/Reject) and level submissions will be posted here.");
    }
    default:
      if (isPrivate) return say("Unknown command. /help");
  }
}

async function login(from: Json, username: string, password: string, say: (h: string, e?: Json) => Promise<Json>) {
  await clearState(from.id);
  const tries = await hits(`login:${from.id}`, 3600);
  const accTries = await hits(`login_acc:${username.toLowerCase()}`, 3600);
  if (tries >= LOGIN_TRIES_PER_HOUR || accTries >= LOGIN_TRIES_PER_HOUR * 2) return say("⏳ Too many login attempts. Try again in an hour.");
  await hit(`login:${from.id}`);
  await hit(`login_acc:${username.toLowerCase()}`);

  const { data: userId, error } = await db.rpc("tg_check_password", { p_username: username, p_password: password });
  if (error) return say("Something went wrong, try again later.");
  if (!userId) {
    const left = LOGIN_TRIES_PER_HOUR - tries - 1;
    return say(`❌ Wrong nickname or password.${left > 0 ? ` ${left} attempt${left === 1 ? "" : "s"} left this hour.` : ""} Send /login to try again.`);
  }
  // one Telegram ↔ one account
  await db.from("telegram_links").delete().or(`tg_user_id.eq.${from.id},user_id.eq.${userId}`);
  await db.from("telegram_links").insert({ user_id: userId, tg_user_id: from.id, tg_username: from.username ?? null });
  const { data: p } = await db.from("profiles").select("username, role").eq("id", userId).maybeSingle();
  return say(
    `✅ Logged in as <b>${esc(p?.username)}</b>.\nSite notifications will come here — /notify off to mute them.${RANK[p?.role] >= 1 ? "\nAs staff you can also review submissions with the buttons in the staff chat." : ""}`,
  );
}

// ---------------------------------------------------------------- submitting from the DM

// Same rules as the site forms and the database checks
const VIDEO_RE = /^https:\/\/((www\.|m\.)?youtube\.com|youtu\.be|t\.me|telegram\.me)\//;
const FPS_RE = /^[A-Za-z0-9 /+.-]{1,20}$/;
const TG_RE = /^[A-Za-z0-9_]{4,32}$/;

type Say = (html: string, extra?: Json) => Promise<Json>;
const dm = (chatId: number): Say => (html, extra = {}) =>
  tg("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra });
const okNo = (prefix: string) => ({ inline_keyboard: [[cb("✅ Submit", `${prefix}:ok`), cb("❌ Cancel", `${prefix}:no`)]] });

async function submitter(tgUser: number, say: Say) {
  const acc = await account(tgUser);
  if (!acc) {
    await say("Log in first — /login (your ChallengeGrind nickname and password).");
    return null;
  }
  if (acc.banned) {
    await say("Your account is banned, you can't submit.");
    return null;
  }
  return acc;
}

// ----- records

/** Levels that can't take a new record: completed, verified or already pending */
async function blockedLevels(userId: string) {
  const [{ data: rec }, { data: ver }] = await Promise.all([
    db.from("records").select("level_id").eq("player_id", userId).neq("status", "rejected"),
    db.from("levels").select("id").eq("verifier_id", userId),
  ]);
  return new Set([...(rec ?? []).map((r: Json) => Number(r.level_id)), ...(ver ?? []).map((l: Json) => Number(l.id))]);
}

async function startRecord(from: Json, query: string, say: Say) {
  if (!(await submitter(from.id, say))) return;
  await setState(from.id, "submit_record", { stage: "level" });
  if (query) return recordInput(from, query, say);
  return say("📨 <b>Submit a record</b>\nWhich level? Send its <b>name</b>, <code>#position</code> or level ID.\n\n/cancel to stop.");
}

async function chooseRecordLevel(from: Json, l: { id: number; name: string; position: number }, say: Say) {
  await setState(from.id, "submit_record", { stage: "video", level_id: l.id, level: `#${l.position} ${l.name}` });
  return say(`🎯 <b>#${l.position} ${esc(l.name)}</b>\n\n🎬 Now send the <b>video link</b> — YouTube or a Telegram post.\nRaw footage isn't required, but keep it for 3 days.`);
}

async function recordInput(from: Json, text: string | null, say: Say) {
  const st = await getState(from.id);
  if (st?.step !== "submit_record") return;
  const d = st.data;
  const acc = await submitter(from.id, say);
  if (!acc) return clearState(from.id);

  if (d.stage === "level") {
    if (!text) return say("Send the level name, <code>#position</code> or level ID.");
    const blocked = await blockedLevels(acc.id);
    const found = (await findLevels(text)).filter((l) => !blocked.has(Number(l.id)));
    if (!found.length) return say("No level you can submit matches that — levels you've completed or already submitted are hidden.\nTry another name or /cancel.");
    if (found.length === 1) return chooseRecordLevel(from, found[0], say);
    return say("Several levels match — pick one:", {
      reply_markup: { inline_keyboard: found.slice(0, PAGE).map((l) => [cb(`#${l.position} ${l.name} — ${l.creator}`.slice(0, 60), `sb:lv:${l.id}`)]) },
    });
  }
  if (d.stage === "video") {
    if (!text || text.length > 300 || !VIDEO_RE.test(text)) return say("That's not a YouTube or Telegram link. Send <code>https://youtu.be/…</code> or <code>https://t.me/…</code>");
    await setState(from.id, "submit_record", { ...d, stage: "note", video: text });
    return say("💬 Add a <b>comment</b> for staff (FPS, CBF, …) or skip it.", { reply_markup: { inline_keyboard: [[cb("Skip ⏭", "sb:skip")]] } });
  }
  if (d.stage === "note") {
    const note = text ? text.slice(0, 500) : null;
    await setState(from.id, "submit_record", { ...d, stage: "confirm", note });
    const lines = [`🎯 <b>${esc(d.level)}</b>`, `🎬 ${esc(d.video)}`, note ? `💬 ${esc(note)}` : null].filter(Boolean);
    return say(`📨 <b>Check your record</b>\n<blockquote>${lines.join("\n")}</blockquote>`, { reply_markup: okNo("sb") });
  }
  return say("Tap ✅ Submit or ❌ Cancel above.");
}

async function submitRecord(from: Json, say: Say) {
  const st = await getState(from.id);
  if (st?.step !== "submit_record" || st.data.stage !== "confirm") return say("Nothing to submit — start again with /submit.");
  const acc = await submitter(from.id, say);
  await clearState(from.id);
  if (!acc) return;
  const d = st.data;
  const { error } = await db.rpc("tg_submit_record", { p_user: acc.id, p_level: d.level_id, p_video: d.video, p_note: d.note });
  if (error) {
    const m = error.message;
    return say(
      m.includes("records_one_active_idx")
        ? "You already have a record on this level (pending or accepted)."
        : m.includes("too many pending")
          ? "Too many pending records (max 10) — wait for staff to review some."
          : m.includes("video_url")
            ? "That video link isn't allowed — use YouTube or a Telegram post."
            : `Couldn't submit: ${esc(m)}`,
    );
  }
  return say(`✅ <b>Record submitted!</b>\n${esc(d.level)} — staff will review it and I'll tell you the result here.`, {
    reply_markup: { inline_keyboard: [[btn("🌐 My profile", `${SITE}/player/${encodeURIComponent(acc.username)}`)]] },
  });
}

// ----- levels

type Field = { key: string; prompt: string; check: (v: string) => string | null };
const LEVEL_FIELDS: Field[] = [
  { key: "gd_id", prompt: "Send the <b>level ID</b> (digits).", check: (v) => (/^\d{1,12}$/.test(v) && Number(v) > 0 ? null : "The level ID must be digits only.") },
  { key: "name", prompt: "Level <b>name</b>?", check: (v) => (v.length <= 64 ? null : "Up to 64 characters.") },
  { key: "creator", prompt: "<b>Creator(s)</b>? e.g. <i>Player1, Player2</i>", check: (v) => (v.length <= 128 ? null : "Up to 128 characters.") },
  { key: "publisher", prompt: "<b>Publisher</b> — the account that uploaded the level?", check: (v) => (v.length <= 64 ? null : "Up to 64 characters.") },
  { key: "verifier", prompt: "<b>Verifier</b> — who beat it first?", check: (v) => (v.length <= 64 ? null : "Up to 64 characters.") },
  { key: "fps", prompt: "<b>FPS</b>? e.g. <i>240</i> or <i>CBF</i>", check: (v) => (FPS_RE.test(v) ? null : "FPS: e.g. 240 or CBF (letters, digits, / + . -).") },
  { key: "video", prompt: "<b>Verification video</b> — YouTube or a Telegram post link.", check: (v) => (v.length <= 300 && VIDEO_RE.test(v) ? null : "Send a YouTube or Telegram post link (https://…).") },
  { key: "placement", prompt: "Where do you think it belongs? e.g. <i>around #15, harder than X</i>", check: (v) => (v.length <= 500 ? null : "Up to 500 characters.") },
];

async function askLevelField(from: Json, d: Json, say: Say) {
  const i = LEVEL_FIELDS.findIndex((f) => f.key === d.stage);
  const f = LEVEL_FIELDS[i];
  const extra = f.key === "verifier" ? { reply_markup: { inline_keyboard: [[cb("✋ I verified it", "sl:me")]] } } : {};
  return say(`<i>Step ${i + 1}/${LEVEL_FIELDS.length}</i> · ${f.prompt}`, extra);
}

async function startLevel(from: Json, say: Say) {
  if (!(await submitter(from.id, say))) return;
  const d = { stage: "gd_id" };
  await setState(from.id, "submit_level", d);
  await say("🆕 <b>Submit a level</b> — a few questions, /cancel any time.");
  return askLevelField(from, d, say);
}

async function levelInput(from: Json, text: string | null, say: Say) {
  const st = await getState(from.id);
  if (st?.step !== "submit_level") return;
  const d = st.data;
  if (d.stage === "telegram") {
    const v = (text ?? "").replace(/^@/, "").replace(/^https:\/\/t\.me\//, "");
    if (!TG_RE.test(v)) return say("Send a Telegram username staff can contact (4–32 letters, digits, _), without @.");
    return confirmLevel(from, { ...d, telegram: v }, say);
  }
  if (d.stage === "confirm") return say("Tap ✅ Submit or ❌ Cancel above.");
  const f = LEVEL_FIELDS.find((x) => x.key === d.stage);
  if (!f) return;
  const v = (text ?? "").trim();
  if (!v) return say(`Please answer: ${f.prompt}`);
  const err = f.check(v);
  if (err) return say(`${err} Try again or /cancel.`);
  if (f.key === "gd_id") {
    const { data: on } = await db.from("levels").select("name, position").eq("gd_id", Number(v)).maybeSingle();
    if (on) return say(`This level is already on the list: <b>#${on.position} ${esc(on.name)}</b>. Send another level ID or /cancel.`);
  }
  return nextLevelField(from, { ...d, [f.key]: v }, say);
}

async function nextLevelField(from: Json, d: Json, say: Say) {
  const i = LEVEL_FIELDS.findIndex((f) => f.key === d.stage);
  const next = LEVEL_FIELDS[i + 1];
  if (next) {
    const nd = { ...d, stage: next.key };
    await setState(from.id, "submit_level", nd);
    return askLevelField(from, nd, say);
  }
  // Telegram contact: the user's @username if they have one
  if (from.username && TG_RE.test(from.username)) return confirmLevel(from, { ...d, telegram: from.username }, say);
  await setState(from.id, "submit_level", { ...d, stage: "telegram" });
  return say("You don't have a Telegram @username set — send a username staff can contact you at (without @).");
}

async function confirmLevel(from: Json, d: Json, say: Say) {
  await setState(from.id, "submit_level", { ...d, stage: "confirm" });
  const lines = [
    `<b>${esc(d.name)}</b> · ID <code>${esc(d.gd_id)}</code> · 🎮 ${esc(fpsLabel(d.fps))}`,
    `🛠 by ${esc(d.creator)} · published by ${esc(d.publisher)}`,
    `✔️ verified by ${esc(d.verifier)}`,
    `🎬 ${esc(d.video)}`,
    `📍 ${esc(d.placement)}`,
    `👤 contact: @${esc(d.telegram)}`,
  ];
  return say(`🆕 <b>Check your level</b>\n<blockquote>${lines.join("\n")}</blockquote>\nOnly you and the staff see your Telegram contact.`, { reply_markup: okNo("sl") });
}

async function submitLevel(from: Json, say: Say) {
  const st = await getState(from.id);
  if (st?.step !== "submit_level" || st.data.stage !== "confirm") return say("Nothing to submit — start again with /submitlevel.");
  const acc = await submitter(from.id, say);
  await clearState(from.id);
  if (!acc) return;
  const d = st.data;
  const { error } = await db.rpc("tg_submit_level", {
    p_user: acc.id,
    p_gd_id: Number(d.gd_id),
    p_fps: d.fps,
    p_name: d.name,
    p_creator: d.creator,
    p_publisher: d.publisher,
    p_verifier: d.verifier,
    p_video: d.video,
    p_placement: d.placement,
    p_telegram: d.telegram,
  });
  if (error) {
    const m = error.message;
    return say(
      m.includes("level_submissions_one_pending_idx")
        ? "You already have a pending submission of this level."
        : m.includes("already on the list")
          ? "This level is already on the list."
          : m.includes("too many pending")
            ? "Too many pending level submissions (max 3)."
            : `Couldn't submit: ${esc(m)}`,
    );
  }
  return say(`✅ <b>Level submitted!</b>\n${esc(d.name)} — staff will review it and I'll tell you the result here.`);
}

/** Inline buttons of both wizards (DM only) */
async function onSubmitButton(q: Json, kind: string, a: string, b: string | undefined) {
  const say = dm(q.from.id);
  const st = await getState(q.from.id);
  if (kind === "sb") {
    if (st?.step !== "submit_record") return "This form has expired — start again with /submit.";
    if (a === "lv") {
      const acc = await submitter(q.from.id, say);
      if (!acc) return;
      const { data: l } = await db.from("levels").select("id, name, position").eq("id", Number(b)).maybeSingle();
      if (!l || (await blockedLevels(acc.id)).has(Number(l.id))) return "You can't submit this level.";
      await chooseRecordLevel(q.from, l, say);
    } else if (a === "skip") await recordInput(q.from, null, say);
    else if (a === "ok") await submitRecord(q.from, say);
    else if (a === "no") {
      await clearState(q.from.id);
      await say("Cancelled.");
    }
    return;
  }
  if (st?.step !== "submit_level") return "This form has expired — start again with /submitlevel.";
  if (a === "me") {
    if (st.data.stage !== "verifier") return;
    const acc = await submitter(q.from.id, say);
    if (acc) await nextLevelField(q.from, { ...st.data, verifier: acc.username }, say);
  } else if (a === "ok") await submitLevel(q.from, say);
  else if (a === "no") {
    await clearState(q.from.id);
    await say("Cancelled.");
  }
}

// ---------------------------------------------------------------- buttons

async function onCallback(q: Json) {
  const data: string = q.data ?? "";
  const msg = q.message;
  const answer = (text?: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: q.id, text, show_alert: alert });
  const edit = (body: Json) => tg("editMessageText", { chat_id: msg.chat.id, message_id: msg.message_id, ...body });
  const [kind, a, ...rest] = data.split(":");

  if (kind === "lv") {
    const { data: l } = await db.from("levels").select(LEVEL_COLS).eq("id", Number(a)).maybeSingle();
    if (!l) return answer("This level is no longer on the list.", true);
    await edit(await levelCard(l as Level, q.from.id));
    return answer();
  }
  if (kind === "q") {
    await edit(await searchPage(rest.join(":"), Number(a)));
    return answer();
  }
  if (kind === "tp" || kind === "pp") {
    await edit(kind === "tp" ? await topPage(Number(a)) : await playersPage(Number(a)));
    return answer();
  }
  if (kind === "noop") return answer();
  if (kind === "sb" || kind === "sl") {
    if (msg.chat.type !== "private") return answer();
    const err = await onSubmitButton(q, kind, a, rest[0]);
    return answer(err ?? undefined, Boolean(err));
  }
  if (kind === "pk") {
    const card = await packCard(Number(a), q.from.id);
    if (!card) return answer("This pack was deleted.", true);
    await edit(card);
    return answer();
  }

  // staff buttons
  if (kind === "ra" || kind === "rr" || kind === "sr") {
    const acc = await account(q.from.id);
    const need = kind === "sr" ? 2 : 1;
    if (!acc || acc.rank < need) {
      return answer(`Only ${need === 2 ? "List Moderator" : "List Helper"}+ can do this. Log in to the bot in private messages with your staff account.`, true);
    }
    const id = Number(a);
    if (kind === "ra") {
      const { error } = await db.rpc("tg_review_record", { p_actor: acc.id, p_record_id: id, p_approve: true, p_note: null });
      if (error) {
        await refreshStaffMessage("record", id);
        return answer(error.message.includes("already reviewed") ? "Already reviewed." : error.message.includes("not found") ? "This record was withdrawn or deleted." : error.message, true);
      }
      await refreshStaffMessage("record", id);
      return answer("✅ Accepted");
    }
    // reject: ask for the reason as a reply
    const prompt = await tg("sendMessage", {
      chat_id: msg.chat.id,
      message_thread_id: msg.is_topic_message ? msg.message_thread_id : undefined,
      reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true },
      text: `${esc(acc.username)}, reply with the reason for rejecting (or /cancel).`,
      reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Reason" },
    });
    await setState(q.from.id, kind === "rr" ? "reject_record" : "reject_submission", { id, chat_id: msg.chat.id, prompt_id: prompt?.message_id ?? null });
    return answer("Write the reason in the chat");
  }
  return answer();
}

async function rejectWithReason(from: Json, state: Json, reason: string, m: Json) {
  const acc = await account(from.id);
  await clearState(from.id);
  if (state.data.prompt_id) await tg("deleteMessage", { chat_id: state.data.chat_id, message_id: state.data.prompt_id });
  if (!acc) return;
  const note = reason.slice(0, 300);
  const { error } =
    state.step === "reject_record"
      ? await db.rpc("tg_review_record", { p_actor: acc.id, p_record_id: state.data.id, p_approve: false, p_note: note })
      : await db.rpc("tg_reject_submission", { p_actor: acc.id, p_id: state.data.id, p_note: note });
  const kind = state.step === "reject_record" ? "record" : "submission";
  await refreshStaffMessage(kind, state.data.id);
  if (error) {
    await tg("sendMessage", {
      chat_id: m.chat.id,
      message_thread_id: m.is_topic_message ? m.message_thread_id : undefined,
      reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true },
      text: `Couldn't reject: ${error.message.includes("already reviewed") ? "already reviewed" : error.message}`,
    });
  }
}

// ---------------------------------------------------------------- staff chat messages

async function recordMessage(id: number) {
  const { data } = await db
    .from("records")
    .select("id, video_url, note, status, review_note, created_at, level:levels(id, name, position), player:profiles!records_player_id_fkey(username, country), reviewer:profiles!records_reviewer_id_fkey(username)")
    .eq("id", id)
    .maybeSingle();
  const r = data as Json; // embedded rows are single objects (many-to-one)
  if (!r) return null;
  const done = r.status !== "pending";
  const lines = [
    `📥 <b>New record</b> · <code>#${r.id}</code>`,
    `<blockquote>👤 ${flag(r.player?.country)} <a href="${SITE}/player/${encodeURIComponent(r.player?.username)}">${esc(r.player?.username)}</a>`,
    `🎯 <b>#${r.level?.position} ${esc(r.level?.name)}</b> · ${fmt(points(r.level?.position ?? 1))} pts</blockquote>`,
    r.note ? `💬 <i>${esc(r.note)}</i>` : null,
    done
      ? r.status === "approved"
        ? `\n✅ <b>Accepted</b> by ${esc(r.reviewer?.username ?? "staff")}`
        : `\n❌ <b>Rejected</b> by ${esc(r.reviewer?.username ?? "staff")}${r.review_note ? `\n<i>${esc(r.review_note)}</i>` : ""}`
      : null,
  ].filter((x) => x !== null);
  const keyboard = done
    ? [[btn("▶️ Video", r.video_url)]]
    : [[cb("✅ Accept", `ra:${r.id}`), cb("❌ Reject", `rr:${r.id}`)], [btn("▶️ Video", r.video_url), btn("🛠 Admin panel", `${SITE}/admin`)]];
  return { text: lines.join("\n"), parse_mode: "HTML", link_preview_options: preview(r.video_url), reply_markup: { inline_keyboard: keyboard } };
}

async function submissionMessage(id: number) {
  const { data: s } = await db
    .from("level_submissions")
    .select("*, submitter:profiles!level_submissions_submitter_id_fkey(username), reviewer:profiles!level_submissions_reviewer_id_fkey(username)")
    .eq("id", id)
    .maybeSingle();
  if (!s) return null;
  const done = s.status !== "pending";
  const lines = [
    `🆕 <b>Level submission</b> · <code>#${s.id}</code>`,
    `<b>${esc(s.name)}</b>`,
    `<blockquote>🛠 by ${esc(s.creator)} · published by ${esc(s.publisher)}`,
    `✔️ verified by ${esc(s.verifier)}`,
    `🆔 <code>${s.gd_id}</code> · 🎮 ${esc(fpsLabel(s.fps))}</blockquote>`,
    `📍 <i>${esc(s.placement)}</i>`,
    `👤 ${esc(s.submitter?.username)} · @${esc(s.telegram)}`,
    done
      ? s.status === "approved"
        ? `\n✅ <b>Added</b> by ${esc(s.reviewer?.username ?? "staff")}`
        : `\n❌ <b>Rejected</b> by ${esc(s.reviewer?.username ?? "staff")}${s.review_note ? `\n<i>${esc(s.review_note)}</i>` : ""}`
      : null,
  ].filter((x) => x !== null);
  const keyboard = done
    ? [[btn("▶️ Video", s.video_url)]]
    : [[btn("✅ Accept on site", `${SITE}/admin`), cb("❌ Reject", `sr:${s.id}`)], [btn("▶️ Video", s.video_url)]];
  return { text: lines.join("\n"), parse_mode: "HTML", link_preview_options: preview(s.video_url), reply_markup: { inline_keyboard: keyboard } };
}

async function refreshStaffMessage(kind: "record" | "submission", id: number) {
  const { data: ref } = await db.from("telegram_staff_messages").select("chat_id, message_id").eq("kind", kind).eq("item_id", id).maybeSingle();
  if (!ref) return;
  const body = kind === "record" ? await recordMessage(id) : await submissionMessage(id);
  if (!body) {
    await tg("editMessageText", { chat_id: ref.chat_id, message_id: ref.message_id, text: "🗑 This submission was withdrawn or deleted." });
    return;
  }
  await tg("editMessageText", { chat_id: ref.chat_id, message_id: ref.message_id, ...body });
}

async function postToStaff(kind: "record" | "submission", id: number) {
  const cfg = await config();
  if (!cfg.staff_chat_id) return;
  const body = kind === "record" ? await recordMessage(id) : await submissionMessage(id);
  if (!body) return;
  const sent = await tg("sendMessage", { chat_id: Number(cfg.staff_chat_id), message_thread_id: cfg.staff_thread_id ? Number(cfg.staff_thread_id) : undefined, ...body });
  if (sent) await db.from("telegram_staff_messages").upsert({ kind, item_id: id, chat_id: sent.chat.id, message_id: sent.message_id });
}

// ---------------------------------------------------------------- database events

async function toChangelogTopic(body: Json) {
  const cfg = await config();
  if (!cfg.group_chat_id) return;
  await tg("sendMessage", { chat_id: Number(cfg.group_chat_id), message_thread_id: cfg.changelog_thread_id ? Number(cfg.changelog_thread_id) : undefined, ...body });
}

/** Changelog post: what happened, where it is now, its points (and the video preview) */
async function changelogBody(id: number) {
  const { data: c } = await db.from("changelog").select("*").eq("id", id).maybeSingle();
  if (!c) return null;
  const { data: l } = c.level_id ? await db.from("levels").select(LEVEL_COLS).eq("id", c.level_id).maybeSingle() : { data: null };
  const near = [c.next_name ? `above <b>${esc(c.next_name)}</b>` : null, c.prev_name ? `below <b>${esc(c.prev_name)}</b>` : null].filter(Boolean).join(" and ");
  let text: string;
  if (c.kind === "added") {
    text = [
      `🆕 <b>${esc(c.level_name)}</b> has been placed at <b>#${c.new_position}</b>`,
      near ? `<i>${near}</i>` : null,
      l
        ? `<blockquote>🛠 by ${esc(l.creator)}\n✔️ verified by ${esc(l.verifier)}\n🏆 ${fmt(points(c.new_position))} points${l.fps ? ` · 🎮 ${esc(fpsLabel(l.fps))}` : ""}</blockquote>`
        : null,
    ].filter(Boolean).join("\n");
  } else if (c.kind === "moved") {
    const up = c.new_position < c.old_position;
    const delta = Math.abs(c.old_position - c.new_position);
    text = [
      `${up ? "⬆️" : "⬇️"} <b>${esc(c.level_name)}</b> ${up ? "raised" : "lowered"} by ${delta}: #${c.old_position} → <b>#${c.new_position}</b>`,
      near ? `<i>${near}</i>` : null,
      `<blockquote>🏆 ${fmt(points(c.old_position))} → <b>${fmt(points(c.new_position))}</b> points</blockquote>`,
    ].filter(Boolean).join("\n");
  } else {
    text = `🗑 <b>${esc(c.level_name)}</b> has been removed from the list\n<i>it was #${c.old_position}</i>`;
  }
  return {
    text,
    parse_mode: "HTML",
    link_preview_options: c.kind === "removed" ? { is_disabled: true } : preview(l?.video_url),
    reply_markup: l ? { inline_keyboard: [[btn("🌐 Open level", `${SITE}/level/${l.id}`)]] } : undefined,
  };
}

/** Internal: send one of every message type to a Telegram user (design check) */
async function sendPreview(chatId: number) {
  const send = (body: Json) => tg("sendMessage", { chat_id: chatId, ...body });
  await send({ text: "🎨 <b>Design preview</b> — one of each message the bot sends. Buttons work.", parse_mode: "HTML" });
  const { data: top1 } = await db.from("levels").select(LEVEL_COLS).eq("position", 1).maybeSingle();
  if (top1) await send(await levelCard(top1 as Level, chatId));
  await send(await topPage(0));
  await send(await playersPage(0));
  const acc = await account(chatId);
  if (acc) await send((await playerCard(acc.username))!);
  const { data: pk } = await db.from("packs").select("id").order("created_at").limit(1).maybeSingle();
  if (pk) await send((await packCard(pk.id, chatId))!);
  for (const kind of ["added", "moved", "removed"]) {
    const { data: c } = await db.from("changelog").select("id").eq("kind", kind).order("id", { ascending: false }).limit(1).maybeSingle();
    if (c) await send({ ...(await changelogBody(c.id))!, text: `<i>Changelog topic:</i>\n${(await changelogBody(c.id))!.text}` });
  }
  // staff messages in their reviewed state (no live buttons)
  const { data: r } = await db.from("records").select("id").neq("status", "pending").order("id", { ascending: false }).limit(1).maybeSingle();
  if (r) {
    const body = (await recordMessage(r.id))!;
    await send({ ...body, text: `<i>Staff chat:</i>\n${body.text}` });
  }
  const { data: sub } = await db.from("level_submissions").select("id").neq("status", "pending").order("id", { ascending: false }).limit(1).maybeSingle();
  if (sub) {
    const body = (await submissionMessage(sub.id))!;
    await send({ ...body, text: `<i>Staff chat:</i>\n${body.text}` });
  }
  await send({
    text: "✅ <b>Your record was accepted</b>\nYour record on Example Level was accepted!",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[btn("🌐 Open on site", SITE)]] },
  });
}

async function handleEvent(e: { type: string; id: number }) {
  switch (e.type) {
    case "notification": {
      const { data: n } = await db.from("notifications").select("*").eq("id", e.id).maybeSingle();
      if (!n) return;
      const { data: link } = await db.from("telegram_links").select("tg_user_id, notify").eq("user_id", n.user_id).maybeSingle();
      if (!link?.notify) return;
      const icon = { record_approved: "✅", record_rejected: "❌", level_approved: "🆕", level_rejected: "❌", pack_completed: "📦", role_changed: "🛡" }[n.kind as string] ?? "🔔";
      await tg("sendMessage", {
        chat_id: link.tg_user_id,
        text: `${icon} <b>${esc(n.title)}</b>${n.body ? `\n${esc(n.body)}` : ""}`,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: n.link ? { inline_keyboard: [[btn("🌐 Open on site", `${SITE}${n.link}`)]] } : undefined,
      });
      return;
    }
    case "changelog": {
      const body = await changelogBody(e.id);
      if (body) await toChangelogTopic(body);
      return;
    }
    case "pack_created": {
      const { data: log } = await db.from("staff_log").select("details").eq("id", e.id).maybeSingle();
      const name = log?.details?.pack;
      if (!name) return;
      const { data: p } = await db.from("packs").select("id").ilike("name", like(name)).maybeSingle();
      if (!p) return;
      const card = await packCard(p.id);
      if (card) await toChangelogTopic({ ...card, text: `🆕 New pack!\n\n${card.text}` });
      return;
    }
    case "preview":
      return sendPreview(e.id);
    case "record_pending":
      return postToStaff("record", e.id);
    case "submission_pending":
      return postToStaff("submission", e.id);
    case "record_reviewed":
      return refreshStaffMessage("record", e.id);
    case "submission_reviewed":
      return refreshStaffMessage("submission", e.id);
  }
}

// ---------------------------------------------------------------- entry

const eq = (a: string, b: string) => {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  try {
    const internal = req.headers.get("x-internal-secret");
    if (internal !== null) {
      if (!eq(INTERNAL_SECRET, internal)) return new Response("forbidden", { status: 403 });
      await handleEvent(await req.json());
      return new Response("ok");
    }
    if (!eq(WEBHOOK_SECRET, req.headers.get("x-telegram-bot-api-secret-token") ?? "")) return new Response("forbidden", { status: 403 });
    const update = await req.json();
    if (update.message) await onMessage(update.message);
    else if (update.callback_query) await onCallback(update.callback_query);
  } catch (err) {
    console.error(err); // always 200 for Telegram, otherwise it retries the same update forever
  }
  return new Response("ok");
});
