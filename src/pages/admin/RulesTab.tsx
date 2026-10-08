import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { supabase, errorText } from "../../lib/supabase";
import { useAsync } from "../../lib/useAsync";
import { fetchRules } from "../../lib/rules";
import type { ListKind } from "../../lib/list";
import { ErrorBox, Spinner } from "../../components/ui";

// Editing form: items are kept as one textarea per section, one rule per line
type Draft = { title: string; text: string };

export default function RulesTab({ list }: { list: ListKind }) {
  const { data, loading, error } = useAsync(() => fetchRules(list), [list]);
  const [sections, setSections] = useState<Draft[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setSections(data.map((s) => ({ title: s.title, text: s.items.join("\n") })));
  }, [data]);

  const update = (i: number, patch: Partial<Draft>) => setSections((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) =>
    setSections((s) => {
      const n = [...s];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });

  async function save() {
    setMsg(null);
    const rules = sections
      .map((s) => ({ title: s.title.trim(), items: s.text.split("\n").map((l) => l.trim()).filter(Boolean) }))
      .filter((s) => s.title || s.items.length);
    if (rules.some((s) => !s.title)) return setMsg({ ok: false, text: "Every section needs a title" });
    setBusy(true);
    const { error } = await supabase.rpc("set_rules", { p_rules: rules, p_list: list });
    setBusy(false);
    setMsg(error ? { ok: false, text: errorText(error) } : { ok: true, text: "Rules saved" });
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} />;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">Each line is a separate rule.</p>
      {sections.map((s, i) => (
        <div key={i} className="card flex flex-col gap-2.5 p-4">
          <div className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-sm tabular-nums text-brand">{i + 1}.</span>
            <input className="input flex-1" placeholder="Section title" value={s.title} maxLength={120} onChange={(e) => update(i, { title: e.target.value })} />
            <button className="btn-ghost !p-2" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp className="h-4 w-4" />
            </button>
            <button className="btn-ghost !p-2" title="Move down" disabled={i === sections.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown className="h-4 w-4" />
            </button>
            <button
              className="btn-danger !p-2"
              title="Delete section"
              onClick={() => confirm(`Delete section "${s.title || "untitled"}"?`) && setSections((x) => x.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <textarea className="input min-h-28 resize-y" placeholder="A rule&#10;Another rule" value={s.text} onChange={(e) => update(i, { text: e.target.value })} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={() => setSections((s) => [...s, { title: "", text: "" }])}>
          <Plus className="h-4 w-4" /> Section
        </button>
        <button className="btn-primary" disabled={busy} onClick={save}>
          <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save"}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
