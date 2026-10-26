import { useState } from "react";
import { Navigate } from "react-router";
import { Bell } from "lucide-react";
import { useAuth } from "../lib/auth";
import { NotificationItem, useNotifications } from "../components/Notifications";
import { ErrorBox, Spinner } from "../components/ui";

const PAGE = 30;

export default function NotificationsPage() {
  const { session, loading } = useAuth();
  const [limit, setLimit] = useState(PAGE);
  const { items, error, fresh } = useNotifications(limit, Boolean(session));

  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/login" replace />;

  return (
    <div className="mx-auto max-w-xl">
      <section className="card overflow-hidden">
        <h1 className="flex items-center gap-2.5 border-b border-line px-4 py-4 text-lg font-semibold text-white">
          <Bell className="h-5 w-5 text-brand" /> Notifications
        </h1>
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} />
          </div>
        ) : !items ? (
          <Spinner />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-muted">
            <Bell className="h-6 w-6" />
            No notifications yet. You'll hear here when staff review your records or levels.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {items.map((n) => (
              <NotificationItem key={n.id} n={n} unread={fresh.has(n.id)} />
            ))}
          </div>
        )}
      </section>
      {items && items.length >= limit && (
        <div className="mt-4 flex justify-center">
          <button className="btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>
            Show more
          </button>
        </div>
      )}
      <p className="mt-3 text-center text-xs text-neutral-600">Notifications are kept for 90 days.</p>
    </div>
  );
}
