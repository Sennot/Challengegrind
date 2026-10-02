import { useState } from "react";
import { Navigate } from "react-router";
import { ClipboardCheck, ListOrdered, ScrollText, Users } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { PageHeader, Spinner } from "../../components/ui";
import RecordsTab from "./RecordsTab";
import LevelsTab from "./LevelsTab";
import UsersTab from "./UsersTab";
import RulesTab from "./RulesTab";

const TABS = [
  { id: "records", label: "Рекорды", icon: ClipboardCheck, minRank: 1 },
  { id: "levels", label: "Уровни", icon: ListOrdered, minRank: 2 },
  { id: "users", label: "Игроки и стафф", icon: Users, minRank: 3 },
  { id: "rules", label: "Правила", icon: ScrollText, minRank: 3 },
] as const;

export default function AdminPage() {
  const { rank, loading } = useAuth();
  const available = TABS.filter((t) => rank >= t.minRank);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("records");

  if (loading) return <Spinner />;
  if (rank < 1) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Админ-панель" />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {available.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
                active ? "border-brand font-medium text-white" : "border-transparent text-muted hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === "records" && <RecordsTab />}
      {tab === "levels" && rank >= 2 && <LevelsTab />}
      {tab === "users" && rank >= 3 && <UsersTab />}
      {tab === "rules" && rank >= 3 && <RulesTab />}
    </div>
  );
}
