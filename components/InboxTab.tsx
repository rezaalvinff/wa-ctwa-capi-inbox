"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  Circle,
  ClipboardList,
  Hand,
  Inbox,
  Loader2,
  Megaphone,
  MessageCircle,
  PanelRight,
  Pencil,
  Phone,
  Search,
  Send,
  Sparkles,
  Sprout,
  UserRound,
  X,
} from "lucide-react";
import { MITSUBISHI_UNITS } from "@/lib/mitsubishi";
import type { AppConfig, Lead, LeadSource, LeadStatus, LeadWithPreview, Message, SenderType } from "@/lib/types";
import {
  Avatar,
  Badge,
  Card,
  CopyButton,
  InfoRow,
  SourceBadge,
  StatusTag,
  api,
  displayName,
  errText,
  formatDateDivider,
  formatDateTime,
  formatListTime,
  formatTime,
} from "@/components/ui";

const POLL_INTERVAL_MS = 4000;
const WINDOW_24H_MS = 24 * 60 * 60 * 1000;

type StatusFilter = "all" | LeadStatus;
type SourceFilter = "all" | LeadSource;

const SENDER_LABEL: Record<SenderType, string> = {
  customer: "Pelanggan",
  bot: "🤖 Bot DIPO",
  cs: "👤 CS",
};

const BUBBLE_STYLE: Record<SenderType, string> = {
  customer: "rounded-tl-none bg-white",
  bot: "rounded-tr-none bg-[#e3eeff]",
  cs: "rounded-tr-none bg-[#d9fdd3]",
};

const LABEL_STYLE: Record<SenderType, string> = {
  customer: "text-slate-500",
  bot: "text-blue-700",
  cs: "text-emerald-700",
};

function lastActivity(lead: LeadWithPreview): number {
  return Math.max(
    new Date(lead.last_customer_message_at).getTime(),
    lead.last_message ? new Date(lead.last_message.created_at).getTime() : 0,
  );
}

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (60 * 60 * 1000);
}

type Notice = { type: "success" | "info" | "error"; text: string } | null;

interface QualForm {
  customer_name: string;
  domicile: string;
  interested_unit: string;
}

const QUAL_ITEMS: Array<{ key: keyof QualForm; label: string; placeholder: string }> = [
  { key: "customer_name", label: "Nama Prospek", placeholder: "mis. Budi Santoso" },
  { key: "domicile", label: "Domisili", placeholder: "mis. Bekasi" },
  { key: "interested_unit", label: "Unit Diminati", placeholder: "mis. Xpander Cross" },
];

export default function InboxTab({
  active,
  config,
  selectedId,
  onSelect,
}: {
  active: boolean;
  config: AppConfig | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [leads, setLeads] = useState<LeadWithPreview[]>([]);
  const [leadsLoaded, setLeadsLoaded] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [simulating, setSimulating] = useState<"ctwa" | "organic" | null>(null);
  const [simReplying, setSimReplying] = useState(false);
  const [simText, setSimText] = useState("");
  const [togglingBot, setTogglingBot] = useState(false);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<QualForm>({ customer_name: "", domicile: "", interested_unit: "" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const [showPanelMobile, setShowPanelMobile] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageCount = useRef(0);
  const selectedIdRef = useRef<string | null>(selectedId);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // ---------------- Data fetching ----------------
  const loadLeads = useCallback(async () => {
    try {
      const res = await api<{ leads: LeadWithPreview[] }>("/api/leads");
      setLeads(res.leads);
      setListError(null);
    } catch (err) {
      setListError(errText(err));
    } finally {
      setLeadsLoaded(true);
    }
  }, []);

  const loadMessages = useCallback(async (leadId: string) => {
    try {
      const res = await api<{ lead: Lead; messages: Message[] }>(`/api/leads/${leadId}/messages`);
      if (selectedIdRef.current !== leadId) return;
      setActiveLead(res.lead);
      setMessages(res.messages);
    } catch (err) {
      if (selectedIdRef.current === leadId) setChatError(errText(err));
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([
      loadLeads(),
      selectedIdRef.current ? loadMessages(selectedIdRef.current) : Promise.resolve(),
    ]);
  }, [loadLeads, loadMessages]);

  // Polling setiap 4 detik saat tab aktif & halaman terlihat.
  useEffect(() => {
    if (!active) return;
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, refresh]);

  useEffect(() => {
    setActiveLead(null);
    setMessages([]);
    setChatError(null);
    setNotice(null);
    setEditing(false);
    setSimText("");
    lastMessageCount.current = 0;
    if (!selectedId) return;
    setMessagesLoading(true);
    void loadMessages(selectedId).finally(() => setMessagesLoading(false));
  }, [selectedId, loadMessages]);

  useEffect(() => {
    if (messages.length !== lastMessageCount.current) {
      lastMessageCount.current = messages.length;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // ---------------- Derived ----------------
  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return leads
      .filter((l) => statusFilter === "all" || l.status === statusFilter)
      .filter((l) => sourceFilter === "all" || l.source === sourceFilter)
      .filter((l) => {
        if (!q) return true;
        const text = [l.customer_name, l.wa_profile_name, l.domicile, l.interested_unit].join(" ").toLowerCase();
        return (
          text.includes(q) ||
          (qDigits.length > 0 && (l.phone_number.includes(qDigits) || l.phone_number.includes(qDigits.replace(/^0/, "62"))))
        );
      })
      .sort((a, b) => lastActivity(b) - lastActivity(a));
  }, [leads, statusFilter, sourceFilter, search]);

  const counts = useMemo(
    () => ({
      all: leads.length,
      warm: leads.filter((l) => l.status === "warm").length,
      cold: leads.filter((l) => l.status === "cold").length,
    }),
    [leads],
  );

  const lead: Lead | null = activeLead ?? leads.find((l) => l.id === selectedId) ?? null;
  const outside24h = lead ? Date.now() - new Date(lead.last_customer_message_at).getTime() >= WINDOW_24H_MS : false;
  const canSimulateReply = Boolean(lead && (config?.mock_mode || lead.is_simulated));
  const qualDone = lead ? QUAL_ITEMS.filter((i) => Boolean(lead[i.key]?.trim())).length : 0;

  // ---------------- Actions ----------------
  function applyLead(updated: Lead | undefined | null) {
    if (updated && updated.id === selectedIdRef.current) setActiveLead(updated);
  }

  async function simulateNewChat(type: "ctwa" | "organic") {
    setSimulating(type);
    try {
      const res = await api<{ lead: Lead }>("/api/simulate", { method: "POST", body: JSON.stringify({ type }) });
      await loadLeads();
      onSelect(res.lead.id);
      setShowPanelMobile(false);
    } catch (err) {
      setListError(errText(err));
    } finally {
      setSimulating(null);
    }
  }

  async function simulateCustomerReply(text?: string) {
    if (!lead || simReplying) return;
    setSimReplying(true);
    setChatError(null);
    try {
      const res = await api<{ bot: { ran: boolean; became_warm?: boolean; engine?: string; engine_error?: string; lead?: Lead } }>(
        "/api/simulate/reply",
        { method: "POST", body: JSON.stringify({ lead_id: lead.id, text: text?.trim() || undefined }) },
      );
      setSimText("");
      applyLead(res.bot.lead);
      if (res.bot.became_warm) {
        setNotice({ type: "success", text: "🔥 Data lengkap! Lead otomatis menjadi WARM dan chat diserahkan ke CS/Sales (bot nonaktif)." });
      } else if (res.bot.engine_error) {
        setNotice({ type: "info", text: `Gemini gagal, bot memakai fallback rule-based: ${res.bot.engine_error}` });
      }
      await refresh();
    } catch (err) {
      setChatError(errText(err));
    } finally {
      setSimReplying(false);
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !lead || sending) return;
    setSending(true);
    setChatError(null);
    try {
      const res = await api<{ message: Message }>("/api/messages/send", {
        method: "POST",
        body: JSON.stringify({ lead_id: lead.id, text }),
      });
      setDraft("");
      setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]));
      void loadLeads();
    } catch (err) {
      setChatError(errText(err));
    } finally {
      setSending(false);
    }
  }

  async function patchLead(body: Partial<Pick<Lead, "customer_name" | "domicile" | "interested_unit" | "bot_active">>) {
    if (!lead) return null;
    const res = await api<{ lead: Lead; became_warm: boolean }>(`/api/leads/${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    applyLead(res.lead);
    void loadLeads();
    return res;
  }

  async function toggleBot(next: boolean) {
    setTogglingBot(true);
    setChatError(null);
    try {
      await patchLead({ bot_active: next });
    } catch (err) {
      setChatError(errText(err));
    } finally {
      setTogglingBot(false);
    }
  }

  function startEdit() {
    if (!lead) return;
    setForm({
      customer_name: lead.customer_name ?? "",
      domicile: lead.domicile ?? "",
      interested_unit: lead.interested_unit ?? "",
    });
    setNotice(null);
    setEditing(true);
  }

  async function saveQualification() {
    if (!lead || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await patchLead({
        customer_name: form.customer_name,
        domicile: form.domicile,
        interested_unit: form.interested_unit,
      });
      setEditing(false);
      if (res?.became_warm) {
        setNotice({ type: "success", text: "🔥 Ketiga data lengkap — status otomatis berubah menjadi WARM. Bot dinonaktifkan (handoff ke CS/Sales)." });
      } else {
        setNotice({
          type: "info",
          text: res?.lead.status === "warm" ? "Data tersimpan. Status: WARM." : "Data tersimpan. Status tetap COLD sampai ketiga data terisi.",
        });
      }
    } catch (err) {
      setNotice({ type: "error", text: errText(err) });
    } finally {
      setSaving(false);
    }
  }

  // ---------------- Render ----------------
  const segment = (activeKey: string, key: string) =>
    `flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
      activeKey === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
    }`;

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      {/* ================= KOLOM KIRI: DAFTAR PROSPEK ================= */}
      <aside
        className={`${selectedId ? "hidden md:flex" : "flex"} w-full min-h-0 flex-col border-r border-slate-200 bg-white md:w-80 md:shrink-0 lg:w-96`}
      >
        <div className="border-b border-slate-200 p-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => simulateNewChat("ctwa")}
              disabled={simulating !== null}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              {simulating === "ctwa" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
              Simulasi Chat CTWA
            </button>
            <button
              type="button"
              onClick={() => simulateNewChat("organic")}
              disabled={simulating !== null}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {simulating === "organic" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sprout className="h-3.5 w-3.5" />}
              Simulasi Chat Organik
            </button>
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, nomor, kota, unit..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-500/20"
            />
          </div>

          <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1">
            <button type="button" onClick={() => setStatusFilter("all")} className={segment(statusFilter, "all")}>
              Semua <span className="text-slate-400">({counts.all})</span>
            </button>
            <button type="button" onClick={() => setStatusFilter("warm")} className={segment(statusFilter, "warm")}>
              <span className="text-orange-600">🔥 Warm</span> <span className="text-slate-400">({counts.warm})</span>
            </button>
            <button type="button" onClick={() => setStatusFilter("cold")} className={segment(statusFilter, "cold")}>
              <span className="text-sky-600">❄️ Cold</span> <span className="text-slate-400">({counts.cold})</span>
            </button>
          </div>
          <div className="mt-2 flex gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                ["all", "Semua Sumber"],
                ["meta_ads", "Meta Ads"],
                ["organic", "Organik"],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setSourceFilter(key)} className={segment(sourceFilter, key)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {listError && (
          <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{listError}</div>
        )}

        <ul className="min-h-0 flex-1 overflow-y-auto">
          {!leadsLoaded && (
            <li className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Memuat prospek...
            </li>
          )}
          {leadsLoaded && filteredLeads.length === 0 && (
            <li className="flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-500">
              <Inbox className="h-8 w-8 text-slate-300" />
              {leads.length === 0
                ? "Belum ada chat. Klik tombol simulasi untuk mengetes chatbot dari awal."
                : "Tidak ada prospek yang cocok dengan filter/pencarian."}
            </li>
          )}
          {filteredLeads.map((l) => {
            const isActive = l.id === selectedId;
            const preview = l.last_message;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(l.id);
                    setShowPanelMobile(false);
                  }}
                  className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition ${
                    isActive ? "bg-red-50/70" : "hover:bg-slate-50"
                  }`}
                >
                  <Avatar lead={l} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{displayName(l)}</p>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {formatListTime(new Date(lastActivity(l)).toISOString())}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {preview ? (
                        <>
                          {preview.sender_type === "bot" && <span className="text-blue-600">🤖 </span>}
                          {preview.sender_type === "cs" && <span className="text-slate-400">CS: </span>}
                          {preview.content}
                        </>
                      ) : (
                        <span className="italic">Belum ada pesan</span>
                      )}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <StatusTag status={l.status} />
                      <SourceBadge source={l.source} />
                      {l.interested_unit && (
                        <Badge className="bg-slate-50 text-slate-700 ring-slate-200">🚗 {l.interested_unit}</Badge>
                      )}
                      {!l.bot_active && (
                        <Badge className="bg-amber-50 text-amber-700 ring-amber-200" title="Mode manual CS">
                          <Hand className="h-3 w-3" /> Manual
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* ================= KOLOM TENGAH: ROOMCHAT ================= */}
      <section className={`${selectedId ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col bg-[#efeae2]`}>
        {!lead ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-slate-500">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/70">
              <MessageCircle className="h-8 w-8 text-red-600" />
            </div>
            <p className="text-sm font-medium text-slate-700">Pilih prospek untuk membuka roomchat</p>
            <p className="max-w-xs text-xs">
              Chatbot DIPO membalas otomatis dan mengumpulkan nama, domisili, serta unit diminati. Daftar diperbarui tiap 4 detik.
            </p>
          </div>
        ) : (
          <>
            {/* Header Customer Info */}
            <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="-ml-1 rounded-md p-1 text-slate-500 hover:bg-slate-100 md:hidden"
                aria-label="Kembali ke daftar prospek"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Avatar lead={lead} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="truncate text-sm font-semibold">
                    {lead.customer_name || (
                      <span>
                        {lead.wa_profile_name || "Tanpa nama"}{" "}
                        <span className="text-xs font-normal text-slate-400">(profil WA)</span>
                      </span>
                    )}
                  </p>
                  <StatusTag status={lead.status} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Phone className="h-3 w-3" />
                    {lead.phone_number}
                  </span>
                  <CopyButton value={lead.phone_number} label="Copy nomor telepon" />
                  <SourceBadge source={lead.source} variant="long" />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPanelMobile((v) => !v)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 xl:hidden"
                aria-label="Buka panel customer info"
              >
                <PanelRight className="h-5 w-5" />
              </button>
            </header>

            {outside24h && (
              <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Pesan terakhir pelanggan sudah {Math.floor(hoursSince(lead.last_customer_message_at))} jam lalu (lewat 24-hour
                  window WhatsApp). Pesan teks biasa kemungkinan ditolak Meta — gunakan template message.
                </p>
              </div>
            )}

            {/* Pesan */}
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-4 sm:px-8">
              {messagesLoading && messages.length === 0 && (
                <div className="flex justify-center py-8 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const showDivider =
                  !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                const outbound = m.direction === "outbound";
                const sender: SenderType = m.sender_type ?? (outbound ? "cs" : "customer");
                return (
                  <div key={m.id}>
                    {showDivider && (
                      <div className="my-3 flex justify-center">
                        <span className="rounded-md bg-white/80 px-2.5 py-1 text-[11px] text-slate-500 shadow-sm">
                          {formatDateDivider(m.created_at)}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm shadow-sm sm:max-w-[70%] ${BUBBLE_STYLE[sender]}`}>
                        <p className={`mb-0.5 text-[11px] font-semibold ${LABEL_STYLE[sender]}`}>{SENDER_LABEL[sender]}</p>
                        <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                          {formatTime(m.created_at)}
                          {outbound && !m.send_error && <Check className="h-3 w-3" />}
                        </p>
                        {m.send_error && (
                          <p className="mt-1 flex items-start gap-1 rounded bg-red-50 px-1.5 py-1 text-[10px] text-red-700">
                            <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> Gagal terkirim ke WhatsApp: {m.send_error}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {simReplying && (
                <div className="flex justify-end">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-1.5 text-xs text-blue-700 shadow-sm">
                    <Loader2 className="h-3 w-3 animate-spin" /> Bot DIPO sedang mengetik...
                  </span>
                </div>
              )}
            </div>

            {/* Banner status bot */}
            {lead.bot_active ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-800">
                <Bot className="h-4 w-4 shrink-0" />
                <p className="min-w-0 flex-1">
                  <span className="font-semibold">Chatbot Aktif</span> — bot membalas otomatis & mengumpulkan data kualifikasi (
                  {config?.ai_engine === "gemini" ? "Gemini" : "rule-based"}).
                </p>
                <button
                  type="button"
                  onClick={() => toggleBot(false)}
                  disabled={togglingBot}
                  className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 font-medium text-blue-700 ring-1 ring-blue-200 transition hover:bg-blue-100 disabled:opacity-60"
                >
                  {togglingBot ? <Loader2 className="h-3 w-3 animate-spin" /> : <Hand className="h-3 w-3" />}
                  Ambil Alih Manual
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                <UserRound className="h-4 w-4 shrink-0" />
                <p className="min-w-0 flex-1">
                  <span className="font-semibold">Mode Manual CS</span> — bot tidak membalas pesan pelanggan.
                </p>
                <button
                  type="button"
                  onClick={() => toggleBot(true)}
                  disabled={togglingBot}
                  className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 font-medium text-amber-800 ring-1 ring-amber-300 transition hover:bg-amber-100 disabled:opacity-60"
                >
                  {togglingBot ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />}
                  Aktifkan Bot Kembali
                </button>
              </div>
            )}

            {/* Simulasi balasan customer */}
            {canSimulateReply && (
              <div className="border-t border-violet-200 bg-violet-50 px-3 py-2 sm:px-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void simulateCustomerReply(simText);
                  }}
                  className="flex flex-wrap items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() => simulateCustomerReply()}
                    disabled={simReplying}
                    className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 disabled:opacity-60"
                    title="Kirim jawaban pelanggan otomatis sesuai data yang masih kurang"
                  >
                    {simReplying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    Simulasi Balasan Customer
                  </button>
                  <input
                    value={simText}
                    onChange={(e) => setSimText(e.target.value)}
                    placeholder="atau ketik sebagai pelanggan..."
                    className="min-w-0 flex-1 rounded-md border border-violet-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-violet-500"
                  />
                  <button
                    type="submit"
                    disabled={simReplying || !simText.trim()}
                    className="rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-violet-700 ring-1 ring-violet-300 transition hover:bg-violet-100 disabled:opacity-50"
                  >
                    Kirim sbg Pelanggan
                  </button>
                </form>
              </div>
            )}

            {/* Input CS */}
            <div className="border-t border-slate-200 bg-[#f0f2f5] px-3 py-3 sm:px-4">
              {chatError && (
                <div className="mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1">{chatError}</span>
                  <button type="button" onClick={() => setChatError(null)} aria-label="Tutup">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendMessage();
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  rows={1}
                  placeholder="Balas sebagai CS..."
                  title="Enter untuk kirim, Shift+Enter untuk baris baru"
                  className="max-h-32 min-h-[42px] flex-1 resize-none rounded-lg border border-transparent bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  aria-label="Kirim pesan"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
            </div>
          </>
        )}
      </section>

      {/* ================= KOLOM KANAN: CUSTOMER INFO & KUALIFIKASI ================= */}
      {lead && (
        <>
          {showPanelMobile && (
            <div className="fixed inset-0 z-30 bg-slate-900/30 xl:hidden" onClick={() => setShowPanelMobile(false)} aria-hidden />
          )}
          <aside
            className={`${
              showPanelMobile ? "fixed inset-y-0 right-0 z-40 flex" : "hidden"
            } w-full max-w-sm flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-slate-50 p-3 xl:static xl:z-auto xl:flex xl:w-[360px] xl:max-w-none xl:shrink-0`}
          >
            <div className="flex items-center justify-between xl:hidden">
              <h2 className="text-sm font-semibold">Customer Info & Kualifikasi</h2>
              <button
                type="button"
                onClick={() => setShowPanelMobile(false)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-200"
                aria-label="Tutup panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Card title="Customer Info" icon={<UserRound className="h-3.5 w-3.5" />}>
              <dl className="space-y-3">
                <InfoRow label="Nama">
                  {lead.customer_name || <span className="text-slate-400">Belum terkonfirmasi</span>}
                  {lead.wa_profile_name && (
                    <span className="mt-0.5 block text-[11px] text-slate-500">Profil WA: {lead.wa_profile_name}</span>
                  )}
                </InfoRow>
                <InfoRow label="Nomor Telepon">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{lead.phone_number}</span>
                    <CopyButton value={lead.phone_number} label="Copy nomor telepon" />
                  </div>
                </InfoRow>
                <InfoRow label="Source Leads">
                  <SourceBadge source={lead.source} />
                </InfoRow>
                <InfoRow label="CTWA CLID">
                  {lead.ctwa_clid ? (
                    <div className="flex items-start gap-2">
                      <code className="flex-1 break-all rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200">
                        {lead.ctwa_clid}
                      </code>
                      <CopyButton value={lead.ctwa_clid} label="Copy CTWA CLID" />
                    </div>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </InfoRow>
                <div className="grid grid-cols-2 gap-3">
                  <InfoRow label="Ad ID">
                    {lead.ad_id ? <span className="break-all font-mono text-xs">{lead.ad_id}</span> : <span className="text-slate-400">—</span>}
                  </InfoRow>
                  <InfoRow label="Ad Headline">{lead.ad_headline || <span className="text-slate-400">—</span>}</InfoRow>
                </div>
              </dl>
            </Card>

            <Card
              title="Progres Kualifikasi"
              icon={<ClipboardList className="h-3.5 w-3.5" />}
              action={<StatusTag status={lead.status} />}
            >
              <div className="mb-3">
                <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                  <span>{qualDone}/3 data wajib terisi</span>
                  {lead.warm_at && <span>Warm sejak {formatDateTime(lead.warm_at)}</span>}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all ${qualDone === 3 ? "bg-orange-500" : "bg-sky-500"}`}
                    style={{ width: `${(qualDone / 3) * 100}%` }}
                  />
                </div>
              </div>

              {!editing ? (
                <>
                  <ol className="space-y-2">
                    {QUAL_ITEMS.map((item, idx) => {
                      const value = lead[item.key]?.trim();
                      return (
                        <li
                          key={item.key}
                          className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${
                            value ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white"
                          }`}
                        >
                          {value ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          ) : (
                            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                          )}
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-slate-500">
                              {idx + 1}. {item.label}
                            </p>
                            <p className={`truncate text-sm ${value ? "font-medium text-slate-900" : "italic text-slate-400"}`}>
                              {value || "Belum terisi"}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  <button
                    type="button"
                    onClick={startEdit}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit / Koreksi Data
                  </button>
                </>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveQualification();
                  }}
                  className="space-y-3"
                >
                  {QUAL_ITEMS.map((item, idx) => (
                    <label key={item.key} className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        {idx + 1}. {item.label}
                      </span>
                      <input
                        value={form[item.key]}
                        onChange={(e) => setForm((f) => ({ ...f, [item.key]: e.target.value }))}
                        placeholder={item.placeholder}
                        list={item.key === "interested_unit" ? "mitsubishi-units" : undefined}
                        maxLength={120}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                      />
                    </label>
                  ))}
                  <datalist id="mitsubishi-units">
                    {MITSUBISHI_UNITS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                      Simpan Data
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">Jika ketiga data terisi, status otomatis berubah menjadi WARM.</p>
                </form>
              )}

              {notice && (
                <div
                  className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                    notice.type === "success"
                      ? "border-orange-200 bg-orange-50 text-orange-800"
                      : notice.type === "error"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  {notice.text}
                </div>
              )}
            </Card>

            <Card title="Status Meta CAPI" icon={<Megaphone className="h-3.5 w-3.5" />}>
              {lead.source !== "meta_ads" || !lead.ctwa_clid ? (
                <p className="text-xs text-slate-500">Prospek organik — tidak dikirim ke Meta Conversions API.</p>
              ) : (lead.capi_sent_events ?? []).includes("Lead") ? (
                <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Event Lead terkirim {formatDateTime(lead.capi_synced_at)}
                </p>
              ) : lead.status === "warm" ? (
                <p className="text-xs text-amber-700">
                  Pending Sync — akan dikirim lewat tab <b>Meta CAPI Sync</b> (manual atau auto-sync harian).
                </p>
              ) : (
                <p className="text-xs text-slate-500">Menunggu status WARM sebelum dapat dikirim sebagai event Lead.</p>
              )}
            </Card>
          </aside>
        </>
      )}
    </div>
  );
}
