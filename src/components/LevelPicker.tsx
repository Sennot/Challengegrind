import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, Search, X } from "lucide-react";
import type { Level } from "../lib/types";
import { youtubeId, ytThumb } from "../lib/video";

type PickLevel = Pick<Level, "id" | "name" | "position" | "creator" | "video_url">;

/** Searchable level combobox: type a name, creator or "#12"; arrows + Enter to choose. */
export default function LevelPicker({ levels, value, onChange }: { levels: PickLevel[]; value: number | null; onChange: (id: number | null) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = levels.find((l) => l.id === value) ?? null;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^#/, "");
    if (!s) return levels;
    return levels.filter((l) => String(l.position) === s || l.name.toLowerCase().includes(s) || l.creator.toLowerCase().includes(s));
  }, [levels, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(l: PickLevel) {
    onChange(l.id);
    setOpen(false);
    setQ("");
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered[active]) choose(filtered[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={root} className="relative">
      {selected && !open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setTimeout(() => input.current?.focus(), 0);
          }}
          className="input flex items-center gap-3 text-left"
        >
          <Thumb l={selected} />
          <span className="min-w-0 flex-1 truncate">
            <span className="text-muted">#{selected.position}</span> <span className="font-medium text-white">{selected.name}</span>
          </span>
          <X
            className="h-4 w-4 text-muted hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
          />
        </button>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            ref={input}
            className="input pl-9 pr-9"
            placeholder="Название, автор или #позиция"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
            role="combobox"
            aria-expanded={open}
          />
          <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        </div>
      )}

      {open && (
        <div ref={listRef} className="card absolute z-30 mt-1 max-h-72 w-full overflow-y-auto p-1 shadow-lg shadow-black/40" role="listbox">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted">Ничего не найдено</div>
          ) : (
            filtered.map((l, i) => (
              <button
                type="button"
                key={l.id}
                data-i={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(l)}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm ${i === active ? "bg-surface-3" : ""}`}
                role="option"
                aria-selected={l.id === value}
              >
                <span className="w-10 shrink-0 tabular-nums text-muted">#{l.position}</span>
                <Thumb l={l} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-white">{l.name}</span>
                  <span className="block truncate text-xs text-muted">{l.creator}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Thumb({ l }: { l: PickLevel }) {
  const yt = youtubeId(l.video_url);
  return (
    <span className="block aspect-video w-12 shrink-0 overflow-hidden rounded bg-surface-3">
      {yt && <img src={ytThumb(yt)} alt="" loading="lazy" className="h-full w-full object-cover" />}
    </span>
  );
}
