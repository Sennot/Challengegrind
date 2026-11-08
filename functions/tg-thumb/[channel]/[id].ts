// Cloudflare Pages Function: /tg-thumb/<channel>/<message id> → the video's preview image.
// The browser can't read t.me (no CORS), so the edge fetches the public embed page, takes the
// thumbnail and caches the image itself (Telegram's CDN links expire, the cached bytes don't).

const CHANNEL = /^[A-Za-z0-9_]{4,32}$/;
const MESSAGE = /^\d{1,12}$/;
// Only Telegram's own CDN may be fetched from the page
const THUMB = /(?:video_thumb|roundvideo_thumb|photo_wrap)[^>]*background-image:url\('(https:\/\/cdn\d*\.(?:telesco\.pe|cdn-telegram\.org)\/file\/[A-Za-z0-9_\-./]+)'\)/;

const DAY = 86400;

interface Ctx {
  request: Request;
  params: { channel?: string; id?: string };
  waitUntil: (p: Promise<unknown>) => void;
}

const notFound = () => new Response("not found", { status: 404, headers: { "Cache-Control": `public, max-age=${DAY / 24}` } });

export async function onRequestGet({ request, params, waitUntil }: Ctx): Promise<Response> {
  const channel = String(params.channel ?? "");
  const id = String(params.id ?? "");
  if (!CHANNEL.test(channel) || !MESSAGE.test(id)) return notFound();

  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(new URL(`/tg-thumb/${channel}/${id}`, request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  const page = await fetch(`https://t.me/${channel}/${id}?embed=1&mode=tme`, { headers: { "User-Agent": "Mozilla/5.0 (ChallengeGrind thumbnails)" } });
  if (!page.ok) return notFound();
  const src = (await page.text()).match(THUMB)?.[1];
  if (!src) return notFound();

  const img = await fetch(src);
  const type = img.headers.get("Content-Type") ?? "";
  if (!img.ok || !type.startsWith("image/")) return notFound();

  const res = new Response(img.body, {
    headers: { "Content-Type": type, "Cache-Control": `public, max-age=${7 * DAY}`, "X-Content-Type-Options": "nosniff" },
  });
  waitUntil(cache.put(key, res.clone()));
  return res;
}
