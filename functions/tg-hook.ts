// Cloudflare Pages Function: Telegram webhook filter for the bot's "staff only" mode.
// Telegram posts every update here; only updates from the staff chat are passed on to the
// Supabase Edge Function (with Telegram's secret header untouched, so the bot still verifies it).
// Everything else — DMs, the public group — is acknowledged and dropped.
// To serve everyone again, point the webhook back at the Edge Function (scripts/deploy-function.mjs).

const STAFF_CHAT_ID = -1003715464713;
const BOT_URL = "https://hheygfxermdhdhtrvbxk.supabase.co/functions/v1/telegram-bot";

type Update = {
  message?: { chat?: { id?: number } };
  callback_query?: { message?: { chat?: { id?: number } } };
};

const ok = () => new Response("ok");

export async function onRequestPost({ request }: { request: Request }): Promise<Response> {
  const body = await request.text();
  let update: Update;
  try {
    update = JSON.parse(body) as Update;
  } catch {
    return ok();
  }
  const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
  if (chatId !== STAFF_CHAT_ID) return ok();

  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  const res = await fetch(BOT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
    body,
  });
  // Telegram retries non-2xx answers; pass the bot's status through so failures are retried like before
  return new Response(res.ok ? "ok" : "error", { status: res.ok ? 200 : 502 });
}
