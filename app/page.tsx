"use client";

import { useEffect, useState } from "react";
import { Bot, Car, FlaskConical, MessagesSquare, Send } from "lucide-react";
import InboxTab from "@/components/InboxTab";
import CapiSyncTab from "@/components/CapiSyncTab";
import { api } from "@/components/ui";
import type { AppConfig } from "@/lib/types";

type Tab = "inbox" | "capi";

export default function HubPage() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    api<{ config: AppConfig }>("/api/config")
      .then((res) => setConfig(res.config))
      .catch(() => setConfig(null));
  }, []);

  const tabClass = (key: Tab) =>
    `inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${
      tab === key ? "border-red-600 text-red-700" : "border-transparent text-slate-500 hover:text-slate-800"
    }`;

  return (
    <main className="flex h-dvh w-full flex-col overflow-hidden bg-slate-100 text-slate-900">
      <header className="shrink-0 border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-x-6 px-4">
          <div className="flex items-center gap-2.5 py-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm">
              <Car className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold leading-tight sm:text-base">Mitsubishi DIPO Lead & CAPI Hub</h1>
              <p className="hidden text-[11px] text-slate-500 sm:block">WhatsApp Inbox · AI Chatbot Kualifikasi · Meta Conversions API</p>
            </div>
          </div>

          <nav className="-mb-px flex basis-full gap-1 overflow-x-auto md:basis-0 md:grow" aria-label="Navigasi utama">
            <button type="button" onClick={() => setTab("inbox")} className={tabClass("inbox")}>
              <MessagesSquare className="h-4 w-4" /> Inbox & Chatbot
            </button>
            <button type="button" onClick={() => setTab("capi")} className={tabClass("capi")}>
              <Send className="h-4 w-4" /> Meta CAPI Sync<span className="hidden sm:inline"> (CTWA Warm {config?.capi_window_days ?? 7} Hari)</span>
            </button>
          </nav>

          {config && (
            <div className="hidden items-center gap-2 py-2 lg:flex">
              {config.mock_mode && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200">
                  <FlaskConical className="h-3 w-3" /> MOCK MODE
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                <Bot className="h-3 w-3" /> {config.ai_engine === "gemini" ? "Gemini 2.5 Flash" : "Bot rule-based"}
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <div className={tab === "inbox" ? "h-full" : "hidden"}>
          <InboxTab active={tab === "inbox"} config={config} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
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
      </div>
    </main>
  );
}
