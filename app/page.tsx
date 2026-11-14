"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Bot,
  Car,
  ChevronsLeft,
  ChevronsRight,
  FlaskConical,
  Loader2,
  LogOut,
  MessagesSquare,
  Send,
  Users,
  type LucideIcon,
} from "lucide-react";
import InboxTab from "@/components/InboxTab";
import CapiSyncTab from "@/components/CapiSyncTab";
import KnowledgeTab from "@/components/KnowledgeTab";
import UsersTab, { RoleBadge } from "@/components/UsersTab";
import { api } from "@/components/ui";
import type { AppConfig, AppUser } from "@/lib/types";

type Tab = "inbox" | "capi" | "knowledge" | "users";
type Me = Pick<AppUser, "id" | "email" | "full_name" | "role">;

interface NavItem {
  key: Tab;
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
  adminOnly: boolean;
}

const NAV: NavItem[] = [
  {
    key: "inbox",
    label: "Inbox & Chatbot",
    short: "Inbox",
    description: "Balas chat WhatsApp pelanggan, pantau chatbot, dan ambil alih percakapan kapan saja.",
    icon: MessagesSquare,
    adminOnly: false,
  },
  {
    key: "capi",
    label: "Meta CAPI Sync",
    short: "CAPI",
    description: "Pantau event LeadSubmitted yang terkirim otomatis ke Meta dari lead WARM iklan CTWA.",
    icon: Send,
    adminOnly: true,
  },
  {
    key: "knowledge",
    label: "Knowledge Base",
    short: "Knowledge",
    description: "Materi yang dibaca chatbot: lokasi & jam buka dealer, gambaran unit, dan FAQ.",
    icon: BookOpen,
    adminOnly: true,
  },
  {
    key: "users",
    label: "Pengguna",
    short: "Pengguna",
    description: "Kelola akun Admin & Agent, wilayah agent, dan reset password.",
    icon: Users,
    adminOnly: true,
  },
];

/** Tooltip kartu gelap yang muncul di kanan item sidebar saat di-hover / fokus keyboard. */
function SidebarTooltip({ title, description, shortcut }: { title: string; description?: string; shortcut?: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 w-64 -translate-x-1 -translate-y-1/2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-left text-white opacity-0 shadow-xl shadow-slate-900/20 ring-1 ring-white/10 transition duration-150 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
    >
      <span className="absolute -left-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 bg-slate-900" aria-hidden />
      <span className="relative flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold">{title}</span>
        {shortcut && (
          <kbd className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-200 ring-1 ring-white/15">
            {shortcut}
          </kbd>
        )}
      </span>
      {description && <span className="relative mt-1 block text-[11.5px] leading-snug text-slate-300">{description}</span>}
    </span>
  );
}

const COLLAPSE_KEY = "dipo.sidebar.collapsed";

export default function HubPage() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    api<{ user: Me }>("/api/auth/me")
      .then((res) => setMe(res.user))
      .catch(() => undefined); // 401 sudah di-redirect ke /login oleh api()
    api<{ config: AppConfig }>("/api/config")
      .then((res) => setConfig(res.config))
      .catch(() => setConfig(null));

    // Sidebar dilipat otomatis di layar laptop kecil agar roomchat tetap lega.
    try {
      const saved = window.localStorage.getItem(COLLAPSE_KEY);
      setCollapsed(saved !== null ? saved === "1" : window.innerWidth < 1440);
    } catch {
      setCollapsed(window.innerWidth < 1440);
    }
  }, []);

  const isAdmin = me?.role === "admin";
  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  // Shortcut keyboard: Alt+1 .. Alt+4 untuk pindah menu.
  useEffect(() => {
    const visible = NAV.filter((n) => !n.adminOnly || isAdmin);
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const idx = Number(e.key) - 1;
      if (Number.isInteger(idx) && idx >= 0 && idx < visible.length) {
        e.preventDefault();
        setTab(visible[idx].key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAdmin]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, prev ? "0" : "1");
      } catch {
        // abaikan (mode privat / storage diblokir)
      }
      return !prev;
    });
  }

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.replace("/login");
  }

  if (!me) {
    return (
      <main className="flex h-dvh items-center justify-center bg-slate-100 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  return (
    <main className="flex h-dvh w-full flex-col overflow-hidden bg-slate-100 text-slate-900 md:flex-row">
      {/* ================= SIDEBAR (desktop/tablet) ================= */}
      <aside
        className={`relative z-30 hidden shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 md:flex ${
          collapsed ? "w-[68px]" : "w-60"
        }`}
      >
        <div className={`flex items-center gap-2.5 border-b border-slate-100 py-3 ${collapsed ? "justify-center px-2" : "px-4"}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-700 text-white shadow-md shadow-red-600/25">
            <Car className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold leading-tight">Mitsubishi DIPO</h1>
              <p className="truncate text-[11px] text-slate-500">Lead & CAPI Hub</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 p-2" aria-label="Navigasi utama">
          {!collapsed && <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Menu</p>}
          {items.map((item, idx) => {
            const Icon = item.icon;
            const isActive = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
                className={`group relative flex w-full items-center gap-3 rounded-xl py-2.5 text-sm font-medium outline-none transition duration-150 focus-visible:ring-2 focus-visible:ring-red-500/40 ${
                  collapsed ? "justify-center px-2" : "px-3"
                } ${
                  isActive
                    ? "bg-gradient-to-r from-red-50 to-red-50/30 text-red-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {/* Penanda menu aktif */}
                <span
                  className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-red-600 transition-opacity ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                  aria-hidden
                />
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition duration-150 ${
                    isActive
                      ? "bg-red-600 text-white shadow-sm shadow-red-600/30"
                      : "bg-slate-100 text-slate-500 group-hover:scale-105 group-hover:bg-white group-hover:text-red-600 group-hover:shadow-sm"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
                <SidebarTooltip title={item.label} description={item.description} shortcut={`Alt+${idx + 1}`} />
              </button>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-slate-100 p-2">
          {!collapsed && config && (
            <div className="flex flex-wrap gap-1 px-1">
              {config.mock_mode && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-violet-200">
                  <FlaskConical className="h-3 w-3" /> MOCK MODE
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">
                <Bot className="h-3 w-3" /> {config.ai_engine === "gemini" ? "Gemini AI" : "Bot rule-based"}
              </span>
            </div>
          )}

          {!collapsed ? (
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="truncate text-xs font-semibold text-slate-800" title={me.email}>
                {me.full_name}
              </p>
              <div className="mt-1">
                <RoleBadge role={me.role} />
              </div>
            </div>
          ) : (
            <div className="group relative mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 text-xs font-semibold text-slate-700 ring-2 ring-white">
              {me.full_name.slice(0, 2).toUpperCase()}
              <SidebarTooltip title={me.full_name} description={`${me.role === "admin" ? "Admin" : "Agent"} · ${me.email}`} />
            </div>
          )}

          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            aria-label="Logout"
            className={`group relative flex w-full items-center gap-3 rounded-xl py-2 text-sm font-medium text-slate-600 outline-none transition hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:opacity-60 ${
              collapsed ? "justify-center px-2" : "px-3"
            }`}
          >
            {loggingOut ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
            ) : (
              <LogOut className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:text-red-600" />
            )}
            {!collapsed && <span>Logout</span>}
            <SidebarTooltip title="Logout" description={`Keluar dari akun ${me.email}.`} />
          </button>

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Lebarkan menu" : "Lipat menu"}
            className={`group relative flex w-full items-center gap-3 rounded-xl py-2 text-xs text-slate-400 outline-none transition hover:bg-slate-50 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-red-500/40 ${
              collapsed ? "justify-center px-2" : "px-3"
            }`}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && <span>Lipat menu</span>}
            <SidebarTooltip
              title={collapsed ? "Lebarkan menu" : "Lipat menu"}
              description={collapsed ? "Tampilkan nama menu di sidebar." : "Ringkas sidebar menjadi ikon saja agar ruang chat lebih lega."}
            />
          </button>
        </div>
      </aside>

      {/* ================= TOP BAR (mobile) ================= */}
      <header className="shrink-0 border-b border-slate-200 bg-white md:hidden">
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white">
            <Car className="h-4 w-4" />
          </div>
          <h1 className="min-w-0 flex-1 truncate text-sm font-bold">Mitsubishi DIPO Lead & CAPI Hub</h1>
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600"
            aria-label="Logout"
          >
            {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          </button>
        </div>
        <nav className="-mb-px flex gap-1 overflow-x-auto px-2" aria-label="Navigasi utama">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${
                  isActive ? "border-red-600 text-red-700" : "border-transparent text-slate-500"
                }`}
              >
                <Icon className="h-4 w-4" /> {item.short}
              </button>
            );
          })}
        </nav>
      </header>

      {/* ================= KONTEN ================= */}
      <div className="min-h-0 min-w-0 flex-1">
        <div className={tab === "inbox" ? "h-full" : "hidden"}>
          <InboxTab
            active={tab === "inbox"}
            config={config}
            isAdmin={isAdmin}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
        {isAdmin && (
          <>
            <div className={tab === "capi" ? "h-full" : "hidden"}>
              <CapiSyncTab
                active={tab === "capi"}
                config={config}
                onOpenLead={(id) => {
                  setSelectedId(id);
                  setTab("inbox");
                }}
              />
            </div>
            <div className={tab === "knowledge" ? "h-full" : "hidden"}>
              <KnowledgeTab active={tab === "knowledge"} />
            </div>
            <div className={tab === "users" ? "h-full" : "hidden"}>
              <UsersTab active={tab === "users"} currentUserId={me.id} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
