import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowDown, ArrowUp, Ban, CheckCircle2, Cog, History, KeyRound, ListPlus, Package, Pencil, ScrollText, Shield, Trash2, XCircle, type LucideIcon } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import { formatDate, timeAgo } from "../../lib/time";
import type { StaffAction, StaffLogEntry } from "../../lib/types";
import { Empty, ErrorBox, Spinner, VideoLink } from "../../components/ui";

const PAGE = 50;

const GROUPS: { id: string; label: string; actions: StaffAction[] }[] = [
  { id: "records", label: "Records", actions: ["record_approved", "record_rejected", "record_deleted"] },
  { id: "levels", label: "Levels", actions: ["level_added", "level_moved", "level_removed", "level_edited"] },
  { id: "submissions", label: "Level submissions", actions: ["submission_approved", "submission_rejected", "submission_deleted"] },
  { id: "packs", label: "Packs", actions: ["pack_created", "pack_edited", "pack_deleted"] },
  { id: "players", label: "Roles, bans, passwords", actions: ["role_changed", "user_banned", "user_unbanned", "password_reset"] },
  { id: "rules", label: "Rules", actions: ["rules_updated"] },
];

const TONE = { good: "bg-emerald-500/15 text-emerald-400", bad: "bg-red-500/15 text-red-400", info: "bg-sky-500/15 text-sky-300", warn: "bg-amber-500/15 text-amber-300", brand: "bg-brand/15 text-brand" };
const ICON: Record<StaffAction, [LucideIcon, string]> = {
  record_approved: [CheckCircle2, TONE.good],
  record_rejected: [XCircle, TONE.bad],
  record_deleted: [Trash2, TONE.bad],
  level_added: [ListPlus, TONE.good],
  level_moved: [ArrowUp, TONE.info],
  level_removed: [Trash2, TONE.bad],
  level_edited: [Pencil, TONE.info],
  submission_approved: [CheckCircle2, TONE.good],
  submission_rejected: [XCircle, TONE.bad],
  submission_deleted: [Trash2, TONE.bad],
  pack_created: [Package, TONE.brand],
  pack_edited: [Package, TONE.info],
  pack_deleted: [Trash2, TONE.bad],
  role_changed: [Shield, TONE.info],
  user_banned: [Ban, TONE.bad],
  user_unbanned: [Ban, TONE.good],
  password_reset: [KeyRound, TONE.warn],
  rules_updated: [ScrollText, TONE.info],
};

/** List Helper+: read-only history of everything staff did (written by the database) */
export default function LogTab() {
  const [group, setGroup] = useState("");
  const [actor, setActor] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const staff = useAsync(async () => {
    const rows = must(await supabase.from("profiles").select("username").neq("role", "player").order("username")) as { username: string }[];
    return [...rows.map((r) => r.username), "System"];
  }, []);

  const { data, loading, error } = useAsync(async () => {
    let q = supabase.from("staff_log").select("*").order("created_at", { ascending: false }).limit(limit);
    const g = GROUPS.find((x) => x.id === group);
    if (g) q = q.in("action", g.actions);
    if (actor) q = q.eq("actor_name", actor);
    return must(await q) as StaffLogEntry[];
  }, [group, actor, limit]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <select className="input sm:w-60" value={group} onChange={(e) => (setGroup(e.target.value), setLimit(PAGE))} aria-label="Action type">
          <option value="">All actions</option>
          {GROUPS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        <select className="input sm:w-52" value={actor} onChange={(e) => (setActor(e.target.value), setLimit(PAGE))} aria-label="Staff member">
          <option value="">All staff</option>
          {staff.data?.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-neutral-500">Read-only: nobody can edit or delete entries. "System" means a change made directly in the database.</p>

      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : !data?.length ? (
        <Empty icon={<History />}>Nothing logged yet</Empty>
      ) : (
        <>
          <div className="card divide-y divide-line">
            {data.map((e) => (
              <Entry key={e.id} e={e} />
            ))}
          </div>
          {data.length >= limit && (
            <div className="flex justify-center">
              <button className="btn-ghost" disabled={loading} onClick={() => setLimit((l) => l + PAGE)}>
                {loading ? "Loading…" : "Show more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Entry({ e }: { e: StaffLogEntry }) {
  const [Icon0, tone] = ICON[e.action] ?? [Cog, TONE.info];
  const down = e.action === "level_moved" && Number(e.details.to) > Number(e.details.from);
  const Icon = down ? ArrowDown : Icon0;
  const video = typeof e.details.video === "string" && e.action.startsWith("record_") ? e.details.video : null;
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${down ? TONE.warn : tone}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm leading-relaxed text-neutral-300">{sentence(e)}</p>
        <Details e={e} />
        <p className="mt-1 text-xs text-neutral-500" title={new Date(e.created_at).toLocaleString("en-US")}>
          {timeAgo(e.created_at)} · {formatDate(e.created_at)}
        </p>
      </div>
      {video && <VideoLink url={video} />}
    </div>
  );
}

const Actor = ({ e }: { e: StaffLogEntry }) =>
  e.actor_id ? (
    <Link to={`/player/${e.actor_name}`} className="font-medium text-white hover:text-brand">
      {e.actor_name}
    </Link>
  ) : (
    <span className="font-medium italic text-muted">{e.actor_name}</span>
  );

const Player = ({ e }: { e: StaffLogEntry }) =>
  e.target_id ? (
    <Link to={`/player/${e.target_name}`} className="font-medium text-white hover:text-brand">
      {e.target_name}
    </Link>
  ) : (
    <span className="font-medium text-white">{e.target_name ?? "a deleted player"}</span>
  );

const Level = ({ e }: { e: StaffLogEntry }) =>
  e.level_id ? (
    <Link to={`/level/${e.level_id}`} className="font-medium text-white hover:text-brand">
      {e.level_name}
    </Link>
  ) : (
    <span className="font-medium text-white">{e.level_name ?? String(e.details.name ?? "a level")}</span>
  );

const B = ({ children }: { children: ReactNode }) => <span className="font-medium text-white">{children}</span>;
const str = (v: unknown) => (v === null || v === undefined ? "—" : String(v));

function sentence(e: StaffLogEntry): ReactNode {
  const d = e.details;
  const a = <Actor e={e} />;
  switch (e.action) {
    case "record_approved":
      return <>{a} accepted <Player e={e} />'s record on <Level e={e} /></>;
    case "record_rejected":
      return <>{a} rejected <Player e={e} />'s record on <Level e={e} /></>;
    case "record_deleted":
      return <>{a} deleted <Player e={e} />'s {str(d.status) === "approved" ? "accepted" : str(d.status)} record on <Level e={e} /></>;
    case "level_added":
      return <>{a} added <Level e={e} /> at <B>#{str(d.to)}</B></>;
    case "level_moved":
      return <>{a} moved <Level e={e} /> from #{str(d.from)} to <B>#{str(d.to)}</B></>;
    case "level_removed":
      return <>{a} removed <Level e={e} /> from #{str(d.from)}</>;
    case "level_edited":
      return <>{a} edited <Level e={e} /></>;
    case "submission_approved":
      return <>{a} accepted <Player e={e} />'s level submission <Level e={e} />{d.position ? <> at <B>#{str(d.position)}</B></> : null}</>;
    case "submission_rejected":
      return <>{a} rejected <Player e={e} />'s level submission <B>{str(d.name)}</B></>;
    case "submission_deleted":
      return <>{a} deleted <Player e={e} />'s level submission <B>{str(d.name)}</B></>;
    case "pack_created":
      return <>{a} created the pack <B>{str(d.pack)}</B></>;
    case "pack_edited":
      return <>{a} edited the pack <B>{str(d.pack)}</B></>;
    case "pack_deleted":
      return <>{a} deleted the pack <B>{str(d.pack)}</B></>;
    case "role_changed":
      return <>{a} changed <Player e={e} />'s role: {str(d.from)} → <B>{str(d.to)}</B></>;
    case "user_banned":
      return <>{a} banned <Player e={e} /></>;
    case "user_unbanned":
      return <>{a} unbanned <Player e={e} /></>;
    case "password_reset":
      return <>{a} reset <Player e={e} />'s password</>;
    case "rules_updated":
      return <>{a} updated the rules ({str(d.sections)} sections)</>;
    default:
      return <>{a} · {e.action}</>;
  }
}

/** Second line: reasons, notes and what exactly changed */
function Details({ e }: { e: StaffLogEntry }) {
  const d = e.details;
  const lines: ReactNode[] = [];
  if (typeof d.note === "string") lines.push(<>{e.action.endsWith("rejected") ? "Reason" : "Note"}: {d.note}</>);
  if (typeof d.reason === "string") lines.push(<>Reason: {d.reason}</>);
  if (typeof d.renamed_from === "string") lines.push(<>Renamed from {d.renamed_from}</>);
  const pair = (v: unknown) => (Array.isArray(v) ? (v[0] === v[1] ? str(v[1]) : `${str(v[0])} → ${str(v[1])}`) : str(v));
  if (e.action.startsWith("pack_")) {
    if (d.levels !== undefined) lines.push(<>Levels: {pair(d.levels)}</>);
    if (d.bonus !== undefined) lines.push(<>Bonus: {pair(d.bonus)} pts</>);
  }
  if (e.action === "level_edited" && d.changes && typeof d.changes === "object") {
    for (const [field, v] of Object.entries(d.changes as Record<string, unknown>)) lines.push(<>{field}: {pair(v)}</>);
  }
  if (!lines.length) return null;
  return (
    <div className="mt-1 flex flex-col gap-0.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-neutral-400">
      {lines.map((l, i) => (
        <span key={i} className="break-words">
          {l}
        </span>
      ))}
    </div>
  );
}
