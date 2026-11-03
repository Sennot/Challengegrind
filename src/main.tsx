import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

/** Maintenance mode: true shows only the "Site is down" page and never touches the database. */
const MAINTENANCE = true;

const App = lazy(() => import("./App"));

function SiteDown() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div className="flex flex-col items-center gap-4">
        <img src="/logo.jpg" alt="" className="h-16 w-16 rounded-2xl" />
        <h1 className="text-3xl font-extrabold text-white sm:text-4xl">Site is down</h1>
        <p className="max-w-sm text-sm text-muted">ChallengeGrind is being updated. We'll be back soon.</p>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {MAINTENANCE ? (
      <SiteDown />
    ) : (
      <Suspense fallback={null}>
        <App />
      </Suspense>
    )}
  </StrictMode>,
);
