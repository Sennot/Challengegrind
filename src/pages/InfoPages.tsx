import { Link } from "react-router";
import { ExternalLink } from "lucide-react";
import { supabase } from "../lib/supabase";
import { must, useAsync } from "../lib/useAsync";
import { ROLE_LABEL } from "../lib/roles";
import type { Profile, Role } from "../lib/types";
import { SOCIALS } from "../config/site";
import { fetchRules } from "../lib/rules";
import { BrandIcon, Empty, ErrorBox, Flag, PageHeader, SocialLinks, Spinner } from "../components/ui";
import { useList } from "../lib/list";

export function RulesPage() {
  const { list, isScl } = useList();
  const { data, loading, error } = useAsync(() => fetchRules(list), [list]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={isScl ? "SCL Rules" : "Rules"} />
      {loading ? <Spinner /> : error ? <ErrorBox message={error} /> : !data?.length ? <Empty>No rules yet</Empty> : null}
      <div className="flex flex-col gap-3">
        {data?.map((section, i) => (
          <section key={section.title} className="card p-5">
            <h2 className="mb-3 font-medium text-white">
              <span className="mr-2 tabular-nums text-brand">{i + 1}.</span>
              {section.title}
            </h2>
            <ul className="flex flex-col gap-2 text-sm text-neutral-300">
              {section.items.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-neutral-500" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

const TEAM_ORDER: Role[] = ["owner", "admin", "moderator", "helper"];

export function TeamPage() {
  const { path } = useList();
  const { data, loading, error } = useAsync(
    async () => must(await supabase.from("profiles").select("*").neq("role", "player")) as Profile[],
    [],
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="List team" />
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : !data?.length ? (
        <Empty>No team members yet</Empty>
      ) : (
        <div className="flex flex-col gap-5">
          {TEAM_ORDER.map((role) => {
            const members = data.filter((p) => p.role === role).sort((a, b) => a.username.localeCompare(b.username));
            if (!members.length) return null;
            return (
              <section key={role}>
                <h2 className="mb-2 text-sm font-medium text-muted">{ROLE_LABEL[role]}</h2>
                <div className="card divide-y divide-line">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Flag code={m.country} />
                      <Link to={path(`/player/${m.username}`)} className="min-w-0 flex-1 truncate text-sm font-medium text-white hover:text-brand">
                        {m.username}
                      </Link>
                      <SocialLinks s={m} />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SocialsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Socials" />
      <div className="flex flex-col gap-2.5">
        {SOCIALS.map((s) => (
          <a
            key={s.name}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="card group flex items-center gap-4 p-4 transition-colors hover:border-neutral-600"
          >
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#229ED9] text-white">
              <BrandIcon brand={s.kind} className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-white">{s.name}</div>
              <div className="truncate text-sm text-muted">{s.handle}</div>
            </div>
            <ExternalLink className="h-4 w-4 text-muted group-hover:text-white" />
          </a>
        ))}
      </div>
    </div>
  );
}

export function NotFoundPage() {
  const { path } = useList();
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <div className="text-5xl font-semibold text-white">404</div>
      <p className="text-sm text-muted">Page not found</p>
      <Link to={path("/")} className="btn-ghost mt-2">
        Back to list
      </Link>
    </div>
  );
}
