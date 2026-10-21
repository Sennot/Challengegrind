import { useState, type FormEvent } from "react";
import { ArrowUpDown, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { supabase, errorText } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import type { Level } from "../../lib/types";
import { isHttpsUrl } from "../../lib/video";
import { ErrorBox, PositionBadge, Spinner } from "../../components/ui";

export type Draft = { name: string; creator: string; verifier: string; gd_id: string; video_url: string; fps: string };
export const EMPTY: Draft = { name: "", creator: "", verifier: "", gd_id: "", video_url: "", fps: "" };

export function validate(d: Draft): string | null {
  if (!d.name.trim() || !d.creator.trim() || !d.verifier.trim()) return "Fill in name, creator and verifier";
  if (d.gd_id && !/^\d+$/.test(d.gd_id)) return "Level ID must be digits only";
  if (d.video_url && !isHttpsUrl(d.video_url)) return "Video must be an https:// link";
  if (d.fps && !/^[A-Za-z0-9 /+.-]{1,20}$/.test(d.fps.trim())) return "FPS: e.g. 240 or CBF";
  return null;
}

export function DraftFields({ d, set }: { d: Draft; set: (d: Draft) => void }) {
  const f = (k: keyof Draft, label: string, ph = "") => (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={d[k]} placeholder={ph} onChange={(e) => set({ ...d, [k]: e.target.value })} />
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {f("name", "Name")}
      {f("creator", "Creator(s)")}
      {f("verifier", "Verifier")}
      {f("gd_id", "Level ID", "optional")}
      {f("fps", "FPS", "FPS or CBF")}
      <div>{f("video_url", "Verification video", "https://youtu.be/…")}</div>
    </div>
  );
}

export default function LevelsTab() {
  const { data, loading, error, reload } = useAsync(async () => must(await supabase.from("levels").select("*").order("position")) as Level[], []);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [pos, setPos] = useState("");
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);
  const total = data?.length ?? 0;

  async function add(e: FormEvent) {
    e.preventDefault();
    const v = validate(draft);
    if (v) return setMsg(v);
    const position = pos ? Number(pos) : total + 1;
    const { error } = await supabase.rpc("add_level", {
      p_name: draft.name,
      p_creator: draft.creator,
      p_verifier: draft.verifier,
      p_gd_id: draft.gd_id ? Number(draft.gd_id) : null,
      p_video_url: draft.video_url || null,
      p_position: position,
      p_fps: draft.fps.trim() || null,
    });
    if (error) return setMsg(errorText(error));
    setMsg(`"${draft.name}" added at #${position}`);
    setDraft(EMPTY);
    setPos("");
    void reload();
  }

  async function move(l: Level) {
    const input = prompt(`New position for "${l.name}" (1–${total}):`, String(l.position));
    if (!input) return;
    const { error } = await supabase.rpc("move_level", { p_level_id: l.id, p_new_position: Number(input) });
    if (error) alert(errorText(error));
    void reload();
  }

  async function remove(l: Level) {
    if (!confirm(`Remove "${l.name}" from #${l.position}? All records on this level will be deleted too.`)) return;
    const { error } = await supabase.rpc("remove_level", { p_level_id: l.id });
    if (error) alert(errorText(error));
    void reload();
  }

  async function saveEdit(id: number) {
    const v = validate(editDraft);
    if (v) return alert(v);
    const { error } = await supabase
      .from("levels")
      .update({
        name: editDraft.name.trim(),
        creator: editDraft.creator.trim(),
        verifier: editDraft.verifier.trim(),
        gd_id: editDraft.gd_id ? Number(editDraft.gd_id) : null,
        video_url: editDraft.video_url.trim() || null,
        fps: editDraft.fps.trim() || null,
      })
      .eq("id", id);
    if (error) return alert(errorText(error));
    setEditing(null);
    void reload();
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={add} className="card flex flex-col gap-4 p-5">
        <h2 className="flex items-center gap-2 font-bold">
          <Plus className="h-4 w-4 text-brand" /> Add level
        </h2>
        <DraftFields d={draft} set={setDraft} />
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <label className="label">Position</label>
            <input className="input" type="number" min={1} max={total + 1} placeholder={String(total + 1)} value={pos} onChange={(e) => setPos(e.target.value)} />
          </div>
          <button className="btn-primary">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        {msg && <p className="text-sm text-brand-2">{msg}</p>}
      </form>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : (
        <div className="flex flex-col gap-2">
          {data?.map((l) =>
            editing === l.id ? (
              <div key={l.id} className="card flex flex-col gap-3 border-brand/40 p-4">
                <DraftFields d={editDraft} set={setEditDraft} />
                <div className="flex gap-2">
                  <button className="btn-primary" onClick={() => saveEdit(l.id)}>
                    <Save className="h-4 w-4" /> Save
                  </button>
                  <button className="btn-ghost" onClick={() => setEditing(null)}>
                    <X className="h-4 w-4" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div key={l.id} className="card flex items-center gap-3 p-3">
                <PositionBadge position={l.position} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{l.name}</div>
                  <div className="truncate text-xs text-muted">
                    {l.creator} · verifier {l.verifier}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button className="btn-ghost !p-2" title="Move" onClick={() => move(l)}>
                    <ArrowUpDown className="h-4 w-4" />
                  </button>
                  <button
                    className="btn-ghost !p-2"
                    title="Edit"
                    onClick={() => {
                      setEditing(l.id);
                      setEditDraft({ name: l.name, creator: l.creator, verifier: l.verifier, gd_id: l.gd_id ? String(l.gd_id) : "", video_url: l.video_url ?? "", fps: l.fps ?? "" });
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="btn-danger !p-2" title="Remove" onClick={() => remove(l)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
