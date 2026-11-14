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
  icon: LucideIcon;
  adminOnly: boolean;
}

const NAV: NavItem[] = [
  { key: "inbox", label: "Inbox & Chatbot", short: "Inbox", icon: MessagesSquare, adminOnly: false },
  { key: "capi", label: "Meta CAPI Sync", short: "CAPI", icon: Send, adminOnly: true },
  { key: "knowledge", label: "Knowledge Base", short: "Knowledge", icon: BookOpen, adminOnly: true },
  { key: "users", label: "Pengguna", short: "Pengguna", icon: Users, adminOnly: true },
];

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
        className={`hidden shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 md:flex ${
          collapsed ? "w-[68px]" : "w-60"
        }`}
      >
        <div className={`flex items-center gap-2.5 border-b border-slate-100 py-3 ${collapsed ? "justify-center px-2" : "px-4"}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm">
            <Car className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold leading-tight">Mitsubishi DIPO</h1>
              <p className="truncate text-[11px] text-slate-500">Lead & CAPI Hub</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label="Navigasi utama">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                title={collapsed ? item.label : undefined}
                aria-current={isActive ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition ${
                  collapsed ? "justify-center px-2" : "px-3"
                } ${isActive ? "bg-red-50 text-red-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-red-600" : "text-slate-400"}`} />
                {!collapsed && <span className="truncate">{item.label}</span>}
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
            <div
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700"
              title={`${me.full_name} (${me.role === "admin" ? "Admin" : "Agent"})`}
            >
              {me.full_name.slice(0, 2).toUpperCase()}
            </div>
          )}

          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            title={`Logout (${me.email})`}
            className={`flex w-full items-center gap-3 rounded-lg py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60 ${
              collapsed ? "justify-center px-2" : "px-3"
            }`}
          >
            {loggingOut ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : <LogOut className="h-5 w-5 shrink-0 text-slate-400" />}
            {!collapsed && <span>Logout</span>}
          </button>

          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Lebarkan menu" : "Lipat menu"}
            aria-label={collapsed ? "Lebarkan menu" : "Lipat menu"}
            className={`flex w-full items-center gap-3 rounded-lg py-2 text-xs text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 ${
              collapsed ? "justify-center px-2" : "px-3"
            }`}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && <span>Lipat menu</span>}
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
