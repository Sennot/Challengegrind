import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCircle2, Clock, ListPlus, Package, Shield, XCircle, type LucideIcon } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useBadges, CountBadge } from "../lib/badges";
import { timeAgo } from "../lib/time";
import type { AppNotification, NotificationKind } from "../lib/types";
import { Spinner } from "./ui";

const KIND: Record<NotificationKind, { icon: LucideIcon; cls: string }> = {
  record_approved: { icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-400" },
  record_rejected: { icon: XCircle, cls: "bg-red-500/15 text-red-400" },
  level_approved: { icon: ListPlus, cls: "bg-emerald-500/15 text-emerald-400" },
  level_rejected: { icon: XCircle, cls: "bg-red-500/15 text-red-400" },
  pack_completed: { icon: Package, cls: "bg-brand/15 text-brand" },
  role_changed: { icon: Shield, cls: "bg-violet-500/15 text-violet-300" },
};

/** One notification row; unread ones get a dot and a lighter background */
export function NotificationItem({ n, unread, onClick }: { n: AppNotification; unread: boolean; onClick?: () => void }) {
  const k = KIND[n.kind] ?? KIND.role_changed;
  const Icon = k.icon;
  const body = (
    <>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${k.cls}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-white">{n.title}</span>
          {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="unread" />}
        </span>
        {n.body && <span className="mt-0.5 block break-words text-sm text-neutral-300">{n.body}</span>}
        <span className="mt-1 flex items-center gap-1 text-xs text-neutral-500" title={new Date(n.created_at).toLocaleString("en-US")}>
          <Clock className="h-3 w-3" /> {timeAgo(n.created_at)}
        </span>
      </span>
    </>
  );
  const cls = `flex items-start gap-3 px-4 py-3 transition-colors ${unread ? "bg-surface-2/70" : ""} ${n.link ? "hover:bg-surface-2" : ""}`;
  return n.link ? (
    <Link to={n.link} onClick={onClick} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Loads notifications, then marks them read (the list keeps showing which ones were new) */
export function useNotifications(limit: number, enabled = true) {
  const { refresh: refreshBadges } = useBadges();
  // keep the latest refresh without re-running the fetch when badge counts change
  const refreshRef = useRef(refreshBadges);
  refreshRef.current = refreshBadges;
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ids that were unread when the list was loaded
  const [fresh, setFresh] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(limit);
      if (!alive) return;
      if (error) return setError(error.message);
      const list = data as AppNotification[];
      setItems(list);
      const unread = list.filter((n) => !n.read_at).map((n) => n.id);
      setFresh((prev) => new Set([...prev, ...unread]));
      if (unread.length) {
        await supabase.rpc("mark_notifications_read");
        refreshRef.current();
      }
    })();
    return () => {
      alive = false;
    };
  }, [limit, enabled]);

  return { items, error, fresh };
}

/** Header bell: red counter, dropdown with the latest notifications */
export function NotificationsBell() {
  const { unread } = useBadges();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  return (
    <div ref={ref} className="sm:relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-white"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <Bell className="h-5 w-5" />
        <CountBadge n={unread} className="absolute -right-0.5 -top-0.5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="card absolute inset-x-3 top-14 z-50 overflow-hidden shadow-xl shadow-black/50 sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-96"
          >
            <DropdownList onNavigate={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DropdownList({ onNavigate }: { onNavigate: () => void }) {
  const { items, error, fresh } = useNotifications(8);
  return (
    <>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Bell className="h-4 w-4 text-brand" />
        <span className="font-semibold text-white">Notifications</span>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {error ? (
          <p className="px-4 py-6 text-center text-sm text-red-300">{error}</p>
        ) : !items ? (
          <Spinner className="!py-8" />
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">No notifications yet</p>
        ) : (
          <div className="divide-y divide-line">
            {items.map((n) => (
              <NotificationItem key={n.id} n={n} unread={fresh.has(n.id)} onClick={onNavigate} />
            ))}
          </div>
        )}
      </div>
      <Link to="/notifications" onClick={onNavigate} className="block border-t border-line py-2.5 text-center text-sm text-muted transition-colors hover:bg-surface-2 hover:text-white">
        All notifications
      </Link>
    </>
  );
}
