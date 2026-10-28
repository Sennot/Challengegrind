import { useState, type FormEvent } from "react";
import { Trash2, X } from "lucide-react";
import { supabase, errorText } from "../lib/supabase";

/** List Helper+: remove an accepted record. Opens an inline reason field; the player is notified. */
export default function RevokeButton({ recordId, label, onDone, compact }: { recordId: number; label: string; onDone: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!reason.trim()) return setErr("Enter a reason — the player will see it");
    setBusy(true);
    const { error } = await supabase.rpc("revoke_record", { p_record_id: recordId, p_reason: reason.trim() });
    setBusy(false);
    if (error) return setErr(errorText(error));
    setOpen(false);
    setReason("");
    onDone();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={compact ? "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-red-500/10 hover:text-red-400" : "btn-danger !px-2.5 !py-1.5 text-xs"}
        title={`Remove ${label}`}
      >
        <Trash2 className="h-4 w-4" />
        {!compact && "Remove"}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full basis-full flex-col gap-1.5 rounded-lg border border-red-500/25 bg-red-500/5 p-2.5">
      <div className="text-xs text-red-300">Remove {label}? The player gets a notification with the reason.</div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="input flex-1 !py-1.5"
          placeholder="Reason, e.g. wrong footage"
          value={reason}
          maxLength={300}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex gap-2">
          <button className="btn-danger flex-1 !py-1.5 sm:flex-none" disabled={busy}>
            <Trash2 className="h-4 w-4" /> {busy ? "Removing…" : "Remove"}
          </button>
          <button type="button" className="btn-ghost !py-1.5" disabled={busy} onClick={() => (setOpen(false), setErr(""))} aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </form>
  );
}
