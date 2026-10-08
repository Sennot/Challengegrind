import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useList } from "../lib/list";
import { must, useAsync } from "../lib/useAsync";
import type { ChangelogEntry } from "../lib/types";
import ChangelogItem from "../components/ChangelogItem";
import { Empty, ErrorBox, PageHeader, Spinner } from "../components/ui";

const PAGE = 50;

export default function ChangelogPage() {
  const { list, isScl } = useList();
  const [limit, setLimit] = useState(PAGE);
  const { data, loading, error, setData } = useAsync(
    async () => must(await supabase.from("changelog").select("*").eq("list", list).order("created_at", { ascending: false }).limit(limit)) as ChangelogEntry[],
    [limit, list],
  );

  // New entries appear without reloading the page
  useEffect(() => {
    const ch = supabase
      .channel(`changelog-live-${list}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "changelog" }, (payload) => {
        const e = payload.new as ChangelogEntry;
        if (e.list === list) setData((prev) => [e, ...(prev ?? [])]);
      })
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [setData, list]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={isScl ? "SCL Changelog" : "Changelog"} />
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : !data?.length ? (
        <Empty icon={<History />}>No changes yet</Empty>
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
                Show more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
