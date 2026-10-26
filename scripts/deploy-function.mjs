// Deploy an Edge Function through the Supabase Management API (no Supabase CLI needed).
//   node scripts/deploy-function.mjs telegram-bot           — deploy + secrets + Telegram webhook & commands
//   node scripts/deploy-function.mjs admin-reset-password   — deploy only
// Reads from .env: VITE_SUPABASE_URL, SUPABASE_ACCESS_TOKEN (supabase.com/dashboard/account/tokens),
// and for the bot: TELEGRAM_BOT_TOKEN, TG_WEBHOOK_SECRET, TG_INTERNAL_SECRET. Database writes go through scripts/db.mjs.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const slug = process.argv[2];
const FUNCTIONS = { "telegram-bot": { verify_jwt: false }, "admin-reset-password": { verify_jwt: false } };
if (!FUNCTIONS[slug]) throw new Error(`usage: node scripts/deploy-function.mjs <${Object.keys(FUNCTIONS).join("|")}>`);
if (!env.SUPABASE_ACCESS_TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN missing in .env");

const ref = new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0];
const api = `https://api.supabase.com/v1/projects/${ref}`;
const auth = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` };

async function call(url, init) {
  const r = await fetch(url, init);
  const text = await r.text();
  if (!r.ok) throw new Error(`${init?.method ?? "GET"} ${url} → ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// 1. secrets (bot only)
if (slug === "telegram-bot") {
  for (const k of ["TELEGRAM_BOT_TOKEN", "TG_WEBHOOK_SECRET", "TG_INTERNAL_SECRET"]) if (!env[k]) throw new Error(`${k} missing in .env`);
  await call(`${api}/secrets`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify([
      { name: "TELEGRAM_BOT_TOKEN", value: env.TELEGRAM_BOT_TOKEN },
      { name: "TG_WEBHOOK_SECRET", value: env.TG_WEBHOOK_SECRET },
      { name: "TG_INTERNAL_SECRET", value: env.TG_INTERNAL_SECRET },
      { name: "SITE_URL", value: env.SITE_URL || "https://challengegrind.pages.dev" },
    ]),
  });
  console.log("secrets set");
}

// 2. deploy
const form = new FormData();
form.append("metadata", JSON.stringify({ entrypoint_path: "index.ts", name: slug, verify_jwt: FUNCTIONS[slug].verify_jwt }));
form.append("file", new Blob([readFileSync(new URL(`../supabase/functions/${slug}/index.ts`, import.meta.url))], { type: "application/typescript" }), "index.ts");
const fn = await call(`${api}/functions/deploy?slug=${slug}`, { method: "POST", headers: auth, body: form });
console.log(`deployed ${slug} v${fn?.version ?? "?"} (${fn?.status ?? "?"})`);

if (slug !== "telegram-bot") process.exit(0);

// 3. database → function events
const url = `https://${ref}.supabase.co/functions/v1/telegram-bot`;
const q = (s) => `'${s.replace(/'/g, "''")}'`;
execFileSync(process.execPath, [fileURLToPath(new URL("./db.mjs", import.meta.url)), "-e",
  `insert into public.telegram_config (key, value) values ('function_url', ${q(url)}), ('internal_secret', ${q(env.TG_INTERNAL_SECRET)})
   on conflict (key) do update set value = excluded.value`], { stdio: "inherit" });

// 4. Telegram webhook + command menus
const tg = (method, body) =>
  call(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
await tg("setWebhook", { url, secret_token: env.TG_WEBHOOK_SECRET, allowed_updates: ["message", "callback_query"], max_connections: 20 });
const common = [
  { command: "top", description: "Top levels" },
  { command: "level", description: "Level card: name, #position or level ID" },
  { command: "search", description: "Find levels by name or creator" },
  { command: "players", description: "Top players" },
  { command: "player", description: "Player stats" },
  { command: "packs", description: "All packs" },
  { command: "pack", description: "One pack" },
  { command: "random", description: "A random level" },
  { command: "help", description: "All commands" },
];
await tg("setMyCommands", { commands: common, scope: { type: "all_group_chats" } });
await tg("setMyCommands", {
  commands: [
    { command: "login", description: "Link your ChallengeGrind account" },
    { command: "submit", description: "Submit a record" },
    { command: "submitlevel", description: "Submit a level" },
    { command: "me", description: "Your stats" },
    { command: "notify", description: "Turn notifications on/off" },
    { command: "logout", description: "Unlink your account" },
    ...common,
  ],
  scope: { type: "all_private_chats" },
});
console.log("webhook + commands set:", url);
