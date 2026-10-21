import { useMemo, useState } from "react";
import { Check, Package, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { supabase, errorText } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import { fetchPacks, PACK_COLORS, type Pack, type PackLevel } from "../../lib/packs";
import { formatPoints } from "../../lib/points";
import { Empty, ErrorBox, Spinner } from "../../components/ui";
import { PackBadge } from "../../components/PackBadge";

type Draft = { id: number | null; name: string; color: string; bonus: string; levels: number[] };
const NEW: Draft = { id: null, name: "", color: PACK_COLORS[0], bonus: "0", levels: [] };

/** List Moderator+: packs (name, color, levels, bonus points) */
export default function PacksTab() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [packs, levels] = await Promise.all([
      fetchPacks(),
      supabase.from("levels").select("id, name, position").order("position"),
    ]);
    return { packs, levels: must(levels) as PackLevel[] };
  }, []);
  const [draft, setDraft] = useState<Draft | null>(null);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  async function remove(p: Pack) {
    if (!confirm(`Delete pack "${p.name}"? Players lose its bonus points.`)) return;
    const { error } = await supabase.rpc("delete_pack", { p_id: p.id });
    if (error) return alert(errorText(error));
    void reload();
  }

  const edit = (p: Pack) => setDraft({ id: p.id, name: p.name, color: p.color, bonus: String(p.bonus_points), levels: p.levels.map((l) => l.id) });

  return (
    <div className="flex flex-col gap-4">
      {draft && draft.id === null ? (
        <PackEditor
          draft={draft}
          levels={data.levels}
          onCancel={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            void reload();
          }}
        />
      ) : (
        <button className="btn-primary w-fit" onClick={() => setDraft(NEW)}>
          <Plus className="h-4 w-4" /> New pack
        </button>
      )}

      {data.packs.length === 0 ? (
        <Empty icon={<Package />}>No packs yet</Empty>
      ) : (
        <div className="flex flex-col gap-2.5">
          {data.packs.map((p) =>
            draft?.id === p.id ? (
              <PackEditor
                key={p.id}
                draft={draft}
                levels={data.levels}
                onCancel={() => setDraft(null)}
                onSaved={() => {
                  setDraft(null);
                  void reload();
                }}
              />
            ) : (
              <div key={p.id} className="card overflow-hidden" style={{ borderColor: `${p.color}59` }}>
                <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: `${p.color}14` }}>
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-white">{p.name}</div>
                    <div className="text-xs text-muted">
                      {p.levels.length} level{p.levels.length === 1 ? "" : "s"} · bonus {formatPoints(p.bonus_points)} pts
                    </div>
                  </div>
                  <button className="btn-ghost !p-2" title="Edit" onClick={() => edit(p)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="btn-danger !p-2" title="Delete" onClick={() => remove(p)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 p-3">
                  {p.levels.map((l) => (
                    <span key={l.id} className="max-w-full truncate rounded-md border border-line px-2 py-0.5 text-sm text-neutral-300">
                      <span className="text-muted">#{l.position}</span> {l.name}
                    </span>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function PackEditor({
  draft: initial,
  levels,
  onCancel,
  onSaved,
}: {
  draft: Draft;
  levels: PackLevel[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const chosen = useMemo(() => new Set(d.levels), [d.levels]);
  const byId = useMemo(() => new Map(levels.map((l) => [l.id, l])), [levels]);
  const selected = d.levels.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])).sort((a, b) => a.position - b.position);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^#/, "");
    return s ? levels.filter((l) => String(l.position) === s || l.name.toLowerCase().includes(s)) : levels;
  }, [levels, q]);

  const toggle = (id: number) => setD((x) => ({ ...x, levels: chosen.has(id) ? x.levels.filter((i) => i !== id) : [...x.levels, id] }));

  async function save() {
    setErr("");
    const name = d.name.trim();
    const bonus = Number(d.bonus);
    if (!name || name.length > 40) return setErr("Name: 1–40 characters");
    if (!/^#[0-9a-fA-F]{6}$/.test(d.color)) return setErr("Pick a color");
    if (!d.levels.length) return setErr("Add at least one level");
    if (d.levels.length > 100) return setErr("A pack can have up to 100 levels");
    if (!Number.isFinite(bonus) || bonus < 0 || bonus > 10000) return setErr("Bonus: 0–10000 points");
    setBusy(true);
    const { error } = await supabase.rpc("save_pack", {
      p_id: d.id,
      p_name: name,
      p_color: d.color.toLowerCase(),
      p_level_ids: d.levels,
      p_bonus: Math.round(bonus * 100) / 100,
    });
    setBusy(false);
    if (error) return setErr(error.message.includes("packs_name_lower_idx") ? "A pack with this name already exists" : errorText(error));
    onSaved();
  }

  return (
    <div className="card flex flex-col gap-4 p-4 sm:p-5" style={{ borderColor: `${d.color}80` }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold">
          <Package className="h-4 w-4" style={{ color: d.color }} /> {d.id ? "Edit pack" : "New pack"}
        </h2>
        <PackBadge pack={{ name: d.name.trim() || "Pack name", color: d.color, bonus_points: Number(d.bonus) || 0 }} showBonus />
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div>
          <label className="label">Name</label>
          <input className="input" value={d.name} maxLength={40} placeholder="e.g. Wave pack" onChange={(e) => setD({ ...d, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Bonus points</label>
          <input
            className="input"
            type="number"
            min={0}
            max={10000}
            step="0.01"
            inputMode="decimal"
            value={d.bonus}
            onChange={(e) => setD({ ...d, bonus: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="label">Color</label>
        <div className="flex flex-wrap items-center gap-2">
          {PACK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setD({ ...d, color: c })}
              className="grid h-8 w-8 place-items-center rounded-full transition-transform hover:scale-110"
              style={{ backgroundColor: c, boxShadow: d.color.toLowerCase() === c ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${c}` : undefined }}
              aria-label={c}
            >
              {d.color.toLowerCase() === c && <Check className="h-4 w-4 text-black" strokeWidth={3} />}
            </button>
          ))}
          <label className="flex h-8 cursor-pointer items-center gap-2 rounded-full border border-line px-2.5 text-xs text-muted hover:text-white" title="Custom color">
            <input type="color" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} className="h-5 w-5 cursor-pointer rounded-full border-0 bg-transparent p-0" />
            Custom
          </label>
        </div>
      </div>

      <div>
        <label className="label">
          Levels <span className="text-muted">· {d.levels.length} selected</span>
        </label>
        {selected.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selected.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => toggle(l.id)}
                className="flex max-w-full items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-sm text-neutral-200 hover:border-red-500/50 hover:text-red-300"
                title="Remove from pack"
              >
                <span className="text-muted">#{l.position}</span>
                <span className="truncate">{l.name}</span>
                <X className="h-3.5 w-3.5 shrink-0" />
              </button>
            ))}
          </div>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Find a level: name or #position" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="mt-1.5 max-h-64 overflow-y-auto rounded-lg border border-line p-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted">Nothing found</div>
          ) : (
            filtered.map((l) => {
              const on = chosen.has(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggle(l.id)}
                  className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${on ? "bg-surface-3 text-white" : "text-neutral-300 hover:bg-surface-2"}`}
                >
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? "border-transparent text-black" : "border-neutral-600"}`}
                    style={on ? { backgroundColor: d.color } : undefined}
                  >
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="w-9 shrink-0 tabular-nums text-muted">#{l.position}</span>
                  <span className="min-w-0 flex-1 truncate">{l.name}</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy} onClick={save}>
          <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save pack"}
        </button>
        <button className="btn-ghost" disabled={busy} onClick={onCancel}>
          <X className="h-4 w-4" /> Cancel
        </button>
      </div>
    </div>
  );
}
