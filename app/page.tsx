"use client";

import { useEffect, useState } from "react";
import { Bot, Car, FlaskConical, Loader2, LogOut, MessagesSquare, Send, Users } from "lucide-react";
import InboxTab from "@/components/InboxTab";
import CapiSyncTab from "@/components/CapiSyncTab";
import UsersTab, { RoleBadge } from "@/components/UsersTab";
import { api } from "@/components/ui";
import type { AppConfig, AppUser } from "@/lib/types";

type Tab = "inbox" | "capi" | "users";
type Me = Pick<AppUser, "id" | "email" | "full_name" | "role">;

export default function HubPage() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    api<{ user: Me }>("/api/auth/me")
      .then((res) => setMe(res.user))
      .catch(() => undefined); // 401 sudah di-redirect ke /login oleh api()
    api<{ config: AppConfig }>("/api/config")
      .then((res) => setConfig(res.config))
      .catch(() => setConfig(null));
  }, []);

  const isAdmin = me?.role === "admin";

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.replace("/login");
  }

  const tabClass = (key: Tab) =>
    `inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${
      tab === key ? "border-red-600 text-red-700" : "border-transparent text-slate-500 hover:text-slate-800"
    }`;

  if (!me) {
    return (
      <main className="flex h-dvh items-center justify-center bg-slate-100 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  return (
    <main className="flex h-dvh w-full flex-col overflow-hidden bg-slate-100 text-slate-900">
      <header className="shrink-0 border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-x-6 px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 md:flex-none">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm">
              <Car className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold leading-tight sm:text-base">Mitsubishi DIPO Lead & CAPI Hub</h1>
              <p className="hidden text-[11px] text-slate-500 sm:block md:hidden xl:block">WhatsApp Inbox · AI Chatbot Kualifikasi · Meta Conversions API</p>
            </div>
          </div>

          {/* Menu user (mobile: di baris judul) */}
          <div className="flex items-center gap-2 py-2 md:order-last">
            {config?.mock_mode && (
              <span className="hidden items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200 2xl:inline-flex">
                <FlaskConical className="h-3 w-3" /> MOCK MODE
              </span>
            )}
            {config && (
              <span className="hidden items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 2xl:inline-flex">
                <Bot className="h-3 w-3" /> {config.ai_engine === "gemini" ? "Gemini 2.5 Flash" : "Bot rule-based"}
              </span>
            )}
            <div className="hidden text-right sm:block">
              <p className="max-w-[160px] truncate text-xs font-semibold text-slate-800" title={me.email}>
                {me.full_name}
              </p>
              <div className="flex justify-end">
                <RoleBadge role={me.role} />
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              title={`Logout (${me.email})`}
            >
              {loggingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>

          <nav className="-mb-px flex basis-full gap-1 overflow-x-auto md:basis-0 md:grow" aria-label="Navigasi utama">
            <button type="button" onClick={() => setTab("inbox")} className={tabClass("inbox")}>
              <MessagesSquare className="h-4 w-4" /> Inbox & Chatbot
            </button>
            {isAdmin && (
              <>
                <button type="button" onClick={() => setTab("capi")} className={tabClass("capi")}>
                  <Send className="h-4 w-4" /> Meta CAPI Sync
                  <span className="hidden 2xl:inline"> (CTWA Warm {config?.capi_window_days ?? 7} Hari)</span>
                </button>
                <button type="button" onClick={() => setTab("users")} className={tabClass("users")}>
                  <Users className="h-4 w-4" /> Pengguna
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="min-h-0 flex-1">
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
            <div className={tab === "users" ? "h-full" : "hidden"}>
              <UsersTab active={tab === "users"} currentUserId={me.id} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
