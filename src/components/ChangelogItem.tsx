import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { ChangelogEntry } from "../lib/types";
import { timeAgo } from "../lib/time";

function Lvl({ id, name }: { id?: number | null; name: string }) {
  return id ? (
    <Link to={`/level/${id}`} className="font-medium text-white hover:text-brand">
      {name}
    </Link>
  ) : (
    <span className="font-medium text-white">{name}</span>
  );
}

/** "выше Y и ниже Z" / "выше Y" / "ниже Z" */
function Neighbours({ e }: { e: ChangelogEntry }) {
  const parts: ReactNode[] = [];
  if (e.next_name) parts.push(<>выше <span className="text-neutral-300">{e.next_name}</span></>);
  if (e.prev_name) parts.push(<>ниже <span className="text-neutral-300">{e.prev_name}</span></>);
  if (!parts.length) return null;
  return (
    <>
      , {parts[0]}
      {parts[1] && <> и {parts[1]}</>}
    </>
  );
}

function describe(e: ChangelogEntry) {
  if (e.kind === "added") {
    return {
      icon: Plus,
      tone: "text-emerald-400",
      text: (
        <>
          <Lvl id={e.level_id} name={e.level_name} /> добавлен на <span className="text-white">#{e.new_position}</span>
          <Neighbours e={e} />
        </>
      ),
    };
  }
  if (e.kind === "moved") {
    const up = (e.new_position ?? 0) < (e.old_position ?? 0);
    return {
      icon: up ? ArrowUp : ArrowDown,
      tone: up ? "text-sky-400" : "text-amber-400",
      text: (
        <>
          <Lvl id={e.level_id} name={e.level_name} /> {up ? "поднят" : "опущен"} с #{e.old_position} на{" "}
          <span className="text-white">#{e.new_position}</span>
          <Neighbours e={e} />
        </>
      ),
    };
  }
  return {
    icon: Trash2,
    tone: "text-red-400",
    text: (
      <>
        <Lvl name={e.level_name} /> удалён с #{e.old_position}
      </>
    ),
  };
}

export default function ChangelogItem({ entry }: { entry: ChangelogEntry }) {
  const d = describe(entry);
  const Icon = d.icon;
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-2 ${d.tone}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed text-muted">{d.text}</p>
        <p className="mt-0.5 text-xs text-neutral-600" title={new Date(entry.created_at).toLocaleString("ru-RU")}>
          {timeAgo(entry.created_at)}
        </p>
      </div>
    </div>
  );
}
