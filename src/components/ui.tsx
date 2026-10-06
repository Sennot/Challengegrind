import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, CheckCircle2, Clock, ExternalLink, Loader2, XCircle } from "lucide-react";
import { siDiscord, siTelegram, siTwitch, siYoutube } from "simple-icons";
import "flag-icons/css/flag-icons.min.css";
import { countryName } from "../lib/countries";
import { ROLE_LABEL, ROLE_STYLE } from "../lib/roles";
import { telegramPost, tgEmbed, youtubeId, ytEmbed } from "../lib/video";
import type { RecordStatus, Role, Socials } from "../lib/types";

export const STATUS: Record<RecordStatus, { label: string; cls: string; icon: typeof Clock }> = {
  pending: { label: "Pending", cls: "text-amber-400", icon: Clock },
  approved: { label: "Accepted", cls: "text-emerald-400", icon: CheckCircle2 },
  rejected: { label: "Rejected", cls: "text-red-400", icon: XCircle },
};

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div className={`flex justify-center py-16 ${className}`}>
      <Loader2 className="h-6 w-6 animate-spin text-muted" />
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-500/25 bg-red-500/5 p-3.5 text-sm text-red-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function Empty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center text-muted [&_svg]:h-6 [&_svg]:w-6">
      {icon}
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { icon?: ReactNode; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/** Country flag; players without a country get the international (UN) flag. */
export function Flag({ code, className = "" }: { code: string | null | undefined; className?: string }) {
  const c = code || "un";
  return <span title={code ? countryName(code) : "International"} className={`fi fi-${c} shrink-0 rounded-[2px] ${className}`} />;
}

export function RoleBadge({ role }: { role: Role }) {
  if (role === "player") return null;
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${ROLE_STYLE[role]}`}>{ROLE_LABEL[role]}</span>;
}

export function PositionBadge({ position }: { position: number }) {
  return (
    <span className={`w-12 shrink-0 text-center text-lg font-semibold tabular-nums ${position <= 3 ? "text-brand" : "text-neutral-400"}`}>
      #{position}
    </span>
  );
}

/* ---------- Brand icons ---------- */

const BRANDS = { telegram: siTelegram, discord: siDiscord, youtube: siYoutube, twitch: siTwitch };
export type Brand = keyof typeof BRANDS;

export function BrandIcon({ brand, className = "h-4 w-4" }: { brand: Brand; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d={BRANDS[brand].path} />
    </svg>
  );
}

export function SocialLinks({ s, size = "h-4 w-4" }: { s: Socials; size?: string }) {
  const [copied, setCopied] = useState(false);
  const cls = "grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-white";
  const items: ReactNode[] = [];
  if (s.social_telegram)
    items.push(
      <a key="tg" href={`https://t.me/${s.social_telegram}`} target="_blank" rel="noopener noreferrer" className={cls} title={`Telegram: @${s.social_telegram}`}>
        <BrandIcon brand="telegram" className={size} />
      </a>,
    );
  if (s.social_youtube)
    items.push(
      <a key="yt" href={s.social_youtube} target="_blank" rel="noopener noreferrer" className={cls} title="YouTube">
        <BrandIcon brand="youtube" className={size} />
      </a>,
    );
  if (s.social_twitch)
    items.push(
      <a key="tw" href={`https://twitch.tv/${s.social_twitch}`} target="_blank" rel="noopener noreferrer" className={cls} title={`Twitch: ${s.social_twitch}`}>
        <BrandIcon brand="twitch" className={size} />
      </a>,
    );
  if (s.social_discord)
    items.push(
      <button
        key="dc"
        className={cls}
        title={`Discord: ${s.social_discord} (click to copy)`}
        onClick={() => {
          void navigator.clipboard.writeText(s.social_discord!);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? <Check className={size} /> : <BrandIcon brand="discord" className={size} />}
      </button>,
    );
  if (!items.length) return null;
  return <div className="flex items-center gap-0.5">{items}</div>;
}

/* ---------- Video ---------- */

export function VideoEmbed({ url, title }: { url: string | null; title: string }) {
  const yt = youtubeId(url);
  if (yt)
    return (
      <div className="card aspect-video w-full overflow-hidden">
        <iframe
          src={ytEmbed(yt)}
          title={title}
          className="h-full w-full"
          allow="encrypted-media; picture-in-picture"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  const tg = telegramPost(url);
  if (tg)
    return (
      <div className="card overflow-hidden">
        <iframe
          src={tgEmbed(tg)}
          title={title}
          className="h-[520px] w-full bg-surface"
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  if (url)
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="card flex items-center justify-center gap-2 p-6 text-sm text-muted hover:text-white">
        <ExternalLink className="h-4 w-4" /> Open video
      </a>
    );
  return null;
}

export function VideoLink({ url }: { url: string }) {
  const brand: Brand | null = youtubeId(url) ? "youtube" : telegramPost(url) || url.includes("t.me/") ? "telegram" : null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-white" title="Video">
      {brand ? <BrandIcon brand={brand} /> : <ExternalLink className="h-4 w-4" />}
    </a>
  );
}
