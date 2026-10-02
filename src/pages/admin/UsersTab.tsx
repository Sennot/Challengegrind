import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Ban, KeyRound, Search, ShieldCheck } from "lucide-react";
import { supabase, errorText } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import { useAuth } from "../../lib/auth";
import { ROLE_LABEL, ROLE_RANK } from "../../lib/roles";
import type { Profile, Role } from "../../lib/types";
import { Empty, Flag, RoleBadge, Spinner } from "../../components/ui";

const ROLES: Role[] = ["player", "helper", "moderator", "admin", "owner"];

/** List Admin+: staff management, player search, roles, bans, password resets. */
export default function UsersTab() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const staff = useAsync(
    async () => must(await supabase.from("profiles").select("*").neq("role", "player").order("username")) as Profile[],
    [],
  );
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Profile[] | null>(null);

  async function search(e?: FormEvent) {
    e?.preventDefault();
    const pattern = `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const { data, error } = await supabase.from("profiles").select("*").ilike("username", pattern).order("username").limit(30);
    if (error) return setMsg({ ok: false, text: errorText(error) });
    setFound(data as Profile[]);
  }

  function refresh() {
    void staff.reload();
    if (found) void search();
  }

  const report = (text: string, error: unknown) => setMsg(error ? { ok: false, text: errorText(error) } : { ok: true, text });

  return (
    <div className="flex flex-col gap-6">
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted">
          <ShieldCheck className="h-4 w-4" /> Стафф листа
        </h2>
        {staff.loading ? (
          <Spinner className="!py-8" />
        ) : !staff.data?.length ? (
          <Empty>Стаффа пока нет — найдите игрока ниже и выдайте роль</Empty>
        ) : (
          <div className="card divide-y divide-line">
            {staff.data.map((u) => (
              <UserRow key={u.id} u={u} onChange={refresh} report={report} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted">
          <Search className="h-4 w-4" /> Поиск игроков
        </h2>
        <form onSubmit={search} className="mb-2.5 flex gap-2">
          <input className="input flex-1" placeholder="Ник игрока" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-primary">Найти</button>
        </form>
        {found &&
          (found.length === 0 ? (
            <Empty>Никого не найдено</Empty>
          ) : (
            <div className="card divide-y divide-line">
              {found.map((u) => (
                <UserRow key={u.id} u={u} onChange={refresh} report={report} />
              ))}
            </div>
          ))}
      </section>
    </div>
  );
}

function UserRow({ u, onChange, report }: { u: Profile; onChange: () => void; report: (text: string, error: unknown) => void }) {
  const { profile: me, rank } = useAuth();
  const manageable = u.id !== me?.id && ROLE_RANK[u.role] < rank;

  async function setRole(role: Role) {
    if (!confirm(`Выдать ${u.username} роль «${ROLE_LABEL[role]}»?`)) return;
    const { error } = await supabase.rpc("set_user_role", { p_user_id: u.id, p_role: role });
    report(`${u.username}: роль — ${ROLE_LABEL[role]}`, error);
    onChange();
  }

  async function toggleBan() {
    let reason: string | null = null;
    if (!u.banned) {
      reason = prompt(`Причина блокировки ${u.username}:`);
      if (reason === null) return;
    } else if (!confirm(`Разблокировать ${u.username}?`)) return;
    const { error } = await supabase.rpc("set_user_ban", { p_user_id: u.id, p_banned: !u.banned, p_reason: reason });
    report(u.banned ? `${u.username} разблокирован` : `${u.username} заблокирован`, error);
    onChange();
  }

  async function resetPassword() {
    const password = prompt(`Новый пароль для ${u.username} (минимум 8 символов):`);
    if (!password) return;
    if (password.length < 8) return alert("Минимум 8 символов");
    const { error } = await supabase.functions.invoke("admin-reset-password", { body: { userId: u.id, password } });
    report(`Пароль ${u.username} изменён. Передайте его владельцу аккаунта.`, error);
  }

  return (
    <div className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Flag code={u.country} />
        <Link to={`/player/${u.username}`} className={`truncate text-sm font-medium hover:text-brand ${u.banned ? "text-muted line-through" : "text-white"}`}>
          {u.username}
        </Link>
        <RoleBadge role={u.role} />
        {u.banned && <span className="rounded-md border border-red-500/25 px-2 py-0.5 text-[11px] text-red-400">Бан</span>}
      </div>
      {manageable ? (
        <div className="flex gap-1.5">
          <select className="input !w-40 !py-1.5" value={u.role} disabled={u.banned} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.filter((r) => ROLE_RANK[r] < rank).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button className="btn-ghost !px-2.5" title="Сбросить пароль" onClick={resetPassword}>
            <KeyRound className="h-4 w-4" />
          </button>
          <button className={u.banned ? "btn-ghost !px-2.5" : "btn-danger !px-2.5"} title={u.banned ? "Разблокировать" : "Заблокировать"} onClick={toggleBan}>
            <Ban className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <span className="text-xs text-muted">{u.id === me?.id ? "Это вы" : "Нет прав"}</span>
      )}
    </div>
  );
}
