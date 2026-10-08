import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, LogIn, LogOut, Menu, Settings, User, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabaseConfigured } from "../lib/supabase";
import { NAV_ADMIN, NAV_INFO, NAV_MAIN, type NavItem } from "./nav";
import { Flag } from "./ui";
import { switchPath, useList, type ListKind } from "../lib/list";

function Logo() {
  const { path } = useList();
  return (
    <Link to={path("/")} className="flex items-center gap-2.5">
      <img src="/logo.jpg" alt="" className="h-8 w-8 rounded-lg object-cover" />
      <span className="hidden text-[15px] font-semibold tracking-tight text-white min-[420px]:inline">ChallengeGrind</span>
    </Link>
  );
}

/** CL / SCL switch: keeps the current page when it exists on the other list */
function ListSwitch() {
  const { list } = useList();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const opt = (to: ListKind, label: string, title: string) => (
    <button
      onClick={() => to !== list && nav(switchPath(pathname, to))}
      title={title}
      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${list === to ? "bg-brand text-black" : "text-muted hover:text-white"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex rounded-lg border border-line bg-surface-2 p-0.5">
      {opt("cl", "CL", "Challenge List")}
      {opt("scl", "SCL", "Spam Challenge List")}
    </div>
  );
}

function SideLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const { path } = useList();
  const Icon = item.icon;
  return (
    <NavLink
      to={path(item.to)}
      end={item.to === "/"}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive ? "bg-surface-2 font-medium text-white" : "text-muted hover:bg-surface-2/60 hover:text-neutral-100"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={`h-4 w-4 ${isActive ? "text-brand" : ""}`} />
          {item.label}
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { rank } = useAuth();
  const group = (title: string, items: NavItem[]) => (
    <div className="flex flex-col gap-0.5">
      <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">{title}</div>
      {items.map((i) => (
        <SideLink key={i.to} item={i} onClick={onNavigate} />
      ))}
    </div>
  );
  return (
    <nav className="flex flex-col gap-6">
      {group("List", NAV_MAIN)}
      {group("Info", NAV_INFO)}
      {rank >= (NAV_ADMIN.minRank ?? 0) && group("Manage", [NAV_ADMIN])}
    </nav>
  );
}

function UserMenu() {
  const { path } = useList();
  const { profile, session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!session || !profile) {
    return (
      <Link to={path("/login")} className="btn-primary !px-3 !py-1.5">
        <LogIn className="h-4 w-4" /> Log in
      </Link>
    );
  }

  const item = "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-surface-3";
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-surface-2">
        <Flag code={profile.country} />
        <span className="max-w-32 truncate font-medium text-white">{profile.username}</span>
        <ChevronDown className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="card absolute right-0 mt-1.5 w-48 p-1 shadow-lg shadow-black/40"
          >
            <Link onClick={() => setOpen(false)} to={path(`/player/${profile.username}`)} className={item}>
              <User className="h-4 w-4 text-muted" /> Profile
            </Link>
            <Link onClick={() => setOpen(false)} to={path("/settings")} className={item}>
              <Settings className="h-4 w-4 text-muted" /> Settings
            </Link>
            <button
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
              className={`${item} text-red-400`}
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Layout() {
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
  }, [drawer]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-2 px-4">
          <button onClick={() => setDrawer(true)} className="-ml-1.5 grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-white lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <Logo />
          <div className="ml-auto flex items-center gap-2">
            <ListSwitch />
            <UserMenu />
          </div>
        </div>
      </header>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/60 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85%] flex-col gap-6 border-r border-line bg-surface p-4 lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
            >
              <div className="flex items-center justify-between">
                <Logo />
                <button onClick={() => setDrawer(false)} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-white" aria-label="Close menu">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="overflow-y-auto">
                <SidebarContent onNavigate={() => setDrawer(false)} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="mx-auto flex max-w-[1280px] gap-8 px-4">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 overflow-y-auto py-6 lg:block">
          <SidebarContent />
        </aside>

        <main className="min-w-0 flex-1 py-6 pb-16">
          {!supabaseConfigured && (
            <div className="mb-6 rounded-lg border border-brand/30 p-3.5 text-sm text-brand-2">
              Supabase is not configured: create <code>.env</code> from <code>.env.example</code> and restart the dev server.
            </div>
          )}
          <motion.div key={location.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
