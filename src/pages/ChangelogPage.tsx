import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { supabase } from "../lib/supabase";
import { must, useAsync } from "../lib/useAsync";
import type { ChangelogEntry } from "../lib/types";
import ChangelogItem from "../components/ChangelogItem";
import { Empty, ErrorBox, PageHeader, Spinner } from "../components/ui";

const PAGE = 50;

export default function ChangelogPage() {
  const [limit, setLimit] = useState(PAGE);
  const { data, loading, error, setData } = useAsync(
    async () => must(await supabase.from("changelog").select("*").order("created_at", { ascending: false }).limit(limit)) as ChangelogEntry[],
    [limit],
  );

  // New entries appear without reloading the page
  useEffect(() => {
    const ch = supabase
      .channel("changelog-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "changelog" }, (payload) =>
        setData((prev) => [payload.new as ChangelogEntry, ...(prev ?? [])]),
      )
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [setData]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Changelog" subtitle="Все изменения в списке" />
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : !data?.length ? (
        <Empty icon={<History />}>Изменений пока нет</Empty>
      ) : (
        <>
          <div className="card divide-y divide-line">
            {data.map((e) => (
              <ChangelogItem key={e.id} entry={e} />
            ))}
          </div>
          {data.length >= limit && (
            <div className="mt-4 flex justify-center">
              <button className="btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>
                Показать ещё
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
