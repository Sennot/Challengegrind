// Video ids go into iframe/img URLs, so only accept the real YouTube id format
const YT_ID = /^[\w-]{11}$/;

export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let id: string | null = null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.replace(/^(www|m)\./, "");
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else id = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1] ?? null;
    }
  } catch {
    /* not a URL */
  }
  return id && YT_ID.test(id) ? id : null;
}

/** Public Telegram post: t.me/<channel>/<id> or t.me/s/<channel>/<id> → { channel, id } */
export function telegramPost(url: string | null | undefined): { channel: string; id: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !["t.me", "telegram.me"].includes(u.hostname.replace(/^www\./, ""))) return null;
    const m = u.pathname.match(/^\/(?:s\/)?([A-Za-z0-9_]{4,32})\/(\d+)\/?$/);
    return m ? { channel: m[1], id: m[2] } : null;
  } catch {
    return null;
  }
}

export const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
export const ytEmbed = (id: string) => `https://www.youtube-nocookie.com/embed/${id}`;
export const tgEmbed = (p: { channel: string; id: string }) => `https://t.me/${p.channel}/${p.id}?embed=1&dark=1`;

export const isHttpsUrl = (s: string) => {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
};
