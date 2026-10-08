import { useState } from "react";
import { Navigate } from "react-router";
import { ClipboardCheck, Inbox, ListOrdered, ScrollText, Users } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { PageHeader, Spinner } from "../../components/ui";
import RecordsTab from "./RecordsTab";
import LevelsTab from "./LevelsTab";
import SubmissionsTab from "./SubmissionsTab";
import UsersTab from "./UsersTab";
import RulesTab from "./RulesTab";
import { useList } from "../../lib/list";

const TABS = [
  { id: "records", label: "Records", icon: ClipboardCheck, minRank: 1 },
  { id: "levels", label: "Levels", icon: ListOrdered, minRank: 2 },
  { id: "submissions", label: "Level submissions", icon: Inbox, minRank: 2 },
  { id: "users", label: "Players & staff", icon: Users, minRank: 3 },
  { id: "rules", label: "Rules", icon: ScrollText, minRank: 3 },
] as const;

export default function AdminPage() {
  const { list, isScl, path } = useList();
  const { rank, loading } = useAuth();
  const available = TABS.filter((t) => rank >= t.minRank);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("records");

  if (loading) return <Spinner />;
  if (rank < 1) return <Navigate to={path("/")} replace />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={isScl ? "Admin panel · SCL" : "Admin panel · CL"} subtitle="Records, levels, submissions and rules apply to the list selected at the top; players & staff are shared." />
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
      {tab === "records" && <RecordsTab key={list} list={list} />}
      {tab === "levels" && rank >= 2 && <LevelsTab key={list} list={list} />}
      {tab === "submissions" && rank >= 2 && <SubmissionsTab key={list} list={list} />}
      {tab === "users" && rank >= 3 && <UsersTab />}
      {tab === "rules" && rank >= 3 && <RulesTab key={list} list={list} />}
    </div>
  );
}
