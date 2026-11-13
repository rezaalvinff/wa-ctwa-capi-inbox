"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Inbox,
  Loader2,
  Megaphone,
  MessageCircle,
  PanelRight,
  Search,
  Send,
  Sprout,
  UserRound,
  X,
} from "lucide-react";
import {
  LEAD_STATUSES,
  type Lead,
  type LeadSource,
  type LeadStatus,
  type LeadWithPreview,
  type Message,
} from "@/lib/types";

// ---------------------------------------------------------------------
// Konstanta & helper tampilan
// ---------------------------------------------------------------------
const POLL_INTERVAL_MS = 4000;
const WINDOW_24H_MS = 24 * 60 * 60 * 1000;

type SourceFilter = "all" | LeadSource;

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  qualified: "Qualified",
  closing: "Closing",
  junk: "Junk",
};

const STATUS_STYLE: Record<LeadStatus, string> = {
  new: "bg-slate-100 text-slate-700 ring-slate-200",
  qualified: "bg-amber-50 text-amber-700 ring-amber-200",
  closing: "bg-violet-50 text-violet-700 ring-violet-200",
  junk: "bg-red-50 text-red-700 ring-red-200",
};

const SOURCE_LABEL: Record<LeadSource, string> = {
  meta_ads: "Meta Ads",
  organic: "Organik",
};

const SOURCE_STYLE: Record<LeadSource, string> = {
  meta_ads: "bg-blue-50 text-blue-700 ring-blue-200",
  organic: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const idrFormatter = new Intl.NumberFormat("id-ID");

function formatIdr(value: number): string {
  return `Rp ${idrFormatter.format(value)}`;
}

function parseDigits(input: string): number {
  const digits = input.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function formatListTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return formatTime(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

function formatDateDivider(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatPhone(phone: string): string {
  return phone.startsWith("62") ? `+62 ${phone.slice(2)}` : phone;
}

function initials(name: string | null, phone: string): string {
  const base = (name ?? "").replace(/\(.*?\)/g, "").trim();
  if (!base) return phone.slice(-2);
  return base
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (60 * 60 * 1000);
}

function lastActivity(lead: LeadWithPreview): number {
  return Math.max(
    new Date(lead.last_customer_message_at).getTime(),
    lead.last_message ? new Date(lead.last_message.created_at).getTime() : 0,
  );
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const err = new Error(json.error ?? `HTTP ${res.status}`) as Error & { payload?: unknown };
    err.payload = json;
    throw err;
  }
  return json;
}

// ---------------------------------------------------------------------
// Komponen kecil
// ---------------------------------------------------------------------
function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  );
}

function SourceBadge({ source }: { source: LeadSource }) {
  return (
    <Badge className={SOURCE_STYLE[source]}>
      {source === "meta_ads" ? <Megaphone className="h-3 w-3" /> : <Sprout className="h-3 w-3" />}
      {SOURCE_LABEL[source]}
    </Badge>
  );
}

function StatusBadge({ status }: { status: LeadStatus }) {
  return <Badge className={STATUS_STYLE[status]}>{STATUS_LABEL[status]}</Badge>;
}

function Avatar({ lead, size = "md" }: { lead: Lead; size?: "md" | "lg" }) {
  const dims = size === "lg" ? "h-11 w-11 text-sm" : "h-10 w-10 text-xs";
  const color = lead.source === "meta_ads" ? "bg-blue-600" : "bg-emerald-600";
  return (
    <div
      className={`${dims} ${color} flex shrink-0 items-center justify-center rounded-full font-semibold text-white`}
    >
      {initials(lead.customer_name, lead.phone_number)}
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------
// Halaman utama
// ---------------------------------------------------------------------
type Notice = { type: "success" | "info" | "error"; text: string } | null;

export default function InboxPage() {
  const [leads, setLeads] = useState<LeadWithPreview[]>([]);
  const [leadsLoaded, setLeadsLoaded] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [filter, setFilter] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [simulating, setSimulating] = useState<"ctwa" | "organic" | null>(null);

  const [formStatus, setFormStatus] = useState<LeadStatus>("new");
  const [formDeal, setFormDeal] = useState<number>(0);
  const [formLeadId, setFormLeadId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [capiNotice, setCapiNotice] = useState<Notice>(null);
  const [copied, setCopied] = useState(false);

  const [showCrmMobile, setShowCrmMobile] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageCount = useRef(0);
  const selectedIdRef = useRef<string | null>(null);

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
      setListError(err instanceof Error ? err.message : String(err));
    } finally {
      setLeadsLoaded(true);
    }
  }, []);

  const loadMessages = useCallback(async (leadId: string) => {
    try {
      const res = await api<{ lead: Lead; messages: Message[] }>(`/api/leads/${leadId}/messages`);
      // Abaikan respons basi jika CS sudah pindah lead.
      if (selectedIdRef.current !== leadId) return;
      setActiveLead(res.lead);
      setMessages(res.messages);
    } catch (err) {
      if (selectedIdRef.current === leadId) {
        setSendError(err instanceof Error ? err.message : String(err));
      }
    }
  }, []);

  // Polling daftar lead + pesan aktif setiap 4 detik.
  useEffect(() => {
    void loadLeads();
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void loadLeads();
      if (selectedIdRef.current) void loadMessages(selectedIdRef.current);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadLeads, loadMessages]);

  // Muat pesan saat lead dipilih.
  useEffect(() => {
    if (!selectedId) {
      setActiveLead(null);
      setMessages([]);
      return;
    }
    setMessagesLoading(true);
    setMessages([]);
    setSendError(null);
    setCapiNotice(null);
    lastMessageCount.current = 0;
    void loadMessages(selectedId).finally(() => setMessagesLoading(false));
  }, [selectedId, loadMessages]);

  // Isi form CRM hanya ketika lead aktif berganti (agar polling tidak menimpa input CS).
  useEffect(() => {
    if (activeLead && activeLead.id !== formLeadId) {
      setFormLeadId(activeLead.id);
      setFormStatus(activeLead.status);
      setFormDeal(Number(activeLead.deal_value) || 0);
    }
  }, [activeLead, formLeadId]);

  // Auto-scroll ke bawah saat ada pesan baru.
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
      .filter((l) => (filter === "all" ? true : l.source === filter))
      .filter((l) => {
        if (!q) return true;
        const nameMatch = (l.customer_name ?? "").toLowerCase().includes(q);
        const phoneMatch = qDigits.length > 0 && l.phone_number.includes(qDigits.replace(/^0/, "62"));
        const rawPhoneMatch = qDigits.length > 0 && l.phone_number.includes(qDigits);
        return nameMatch || phoneMatch || rawPhoneMatch;
      })
      .sort((a, b) => lastActivity(b) - lastActivity(a));
  }, [leads, filter, search]);

  const counts = useMemo(
    () => ({
      all: leads.length,
      meta_ads: leads.filter((l) => l.source === "meta_ads").length,
      organic: leads.filter((l) => l.source === "organic").length,
    }),
    [leads],
  );

  const selectedPreview = leads.find((l) => l.id === selectedId) ?? null;
  const lead: Lead | null = activeLead ?? selectedPreview;
  const outside24h = lead
    ? Date.now() - new Date(lead.last_customer_message_at).getTime() >= WINDOW_24H_MS
    : false;
  const formDirty =
    !!lead && (formStatus !== lead.status || formDeal !== (Number(lead.deal_value) || 0));

  // ---------------- Actions ----------------
  async function simulate(type: "ctwa" | "organic") {
    setSimulating(type);
    try {
      const res = await api<{ lead: Lead }>("/api/simulate", {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      await loadLeads();
      setSelectedId(res.lead.id);
      setShowCrmMobile(false);
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
    } finally {
      setSimulating(null);
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !lead || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await api<{ message: Message }>("/api/messages/send", {
        method: "POST",
        body: JSON.stringify({ lead_id: lead.id, text }),
      });
      setDraft("");
      setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]));
      void loadLeads();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  async function saveCapi() {
    if (!lead || saving) return;
    setSaving(true);
    setCapiNotice(null);
    try {
      const res = await api<{
        lead: Lead;
        capi_sent: boolean;
        already_sent?: boolean;
        event_name?: string;
        reason?: string;
      }>("/api/capi", {
        method: "POST",
        body: JSON.stringify({ lead_id: lead.id, status: formStatus, deal_value: formDeal }),
      });
      setActiveLead(res.lead);
      if (res.capi_sent) {
        setCapiNotice({ type: "success", text: `Event '${res.event_name}' berhasil dikirim ke Meta CAPI.` });
      } else {
        setCapiNotice({ type: "info", text: res.reason ?? "Data tersimpan." });
      }
      void loadLeads();
    } catch (err) {
      const payload = (err as Error & { payload?: { lead?: Lead } }).payload;
      if (payload?.lead) setActiveLead(payload.lead);
      setCapiNotice({ type: "error", text: err instanceof Error ? err.message : String(err) });
      void loadLeads();
    } finally {
      setSaving(false);
    }
  }

  async function copyClid() {
    if (!lead?.ctwa_clid) return;
    try {
      await navigator.clipboard.writeText(lead.ctwa_clid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function selectLead(id: string) {
    setSelectedId(id);
    setShowCrmMobile(false);
  }

  // ---------------- Render ----------------
  return (
    <main className="flex h-dvh w-full overflow-hidden bg-slate-100 text-slate-900">
      {/* ================= KOLOM KIRI: DAFTAR LEAD ================= */}
      <aside
        className={`${selectedId ? "hidden md:flex" : "flex"} w-full flex-col border-r border-slate-200 bg-white md:w-80 lg:w-96 md:shrink-0`}
      >
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold leading-tight">CTWA Inbox</h1>
              <p className="truncate text-xs text-slate-500">WhatsApp CS + Meta Conversions API</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => simulate("ctwa")}
              disabled={simulating !== null}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              {simulating === "ctwa" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
              Simulasi Chat CTWA
            </button>
            <button
              type="button"
              onClick={() => simulate("organic")}
              disabled={simulating !== null}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {simulating === "organic" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sprout className="h-3.5 w-3.5" />}
              Simulasi Chat Organik
            </button>
          </div>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau nomor..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                ["all", "Semua"],
                ["meta_ads", "Meta Ads"],
                ["organic", "Organik"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  filter === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {label} <span className="text-slate-400">({counts[key]})</span>
              </button>
            ))}
          </div>
        </div>

        {listError && (
          <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {listError}
          </div>
        )}

        <ul className="flex-1 overflow-y-auto">
          {!leadsLoaded && (
            <li className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Memuat chat...
            </li>
          )}
          {leadsLoaded && filteredLeads.length === 0 && (
            <li className="flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-500">
              <Inbox className="h-8 w-8 text-slate-300" />
              {leads.length === 0
                ? "Belum ada chat. Klik tombol simulasi untuk membuat lead dummy."
                : "Tidak ada lead yang cocok dengan filter/pencarian."}
            </li>
          )}
          {filteredLeads.map((l) => {
            const active = l.id === selectedId;
            const preview = l.last_message;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => selectLead(l.id)}
                  className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition ${
                    active ? "bg-emerald-50" : "hover:bg-slate-50"
                  }`}
                >
                  <Avatar lead={l} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{l.customer_name || formatPhone(l.phone_number)}</p>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {formatListTime(new Date(lastActivity(l)).toISOString())}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {preview ? (
                        <>
                          {preview.direction === "outbound" && <span className="text-slate-400">Anda: </span>}
                          {preview.content}
                        </>
                      ) : (
                        <span className="italic">Belum ada pesan</span>
                      )}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <SourceBadge source={l.source} />
                      <StatusBadge status={l.status} />
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* ================= KOLOM TENGAH: RUANG CHAT ================= */}
      <section className={`${selectedId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-[#efeae2]`}>
        {!lead ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-slate-500">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/70">
              <MessageCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-slate-700">Pilih chat untuk mulai membalas</p>
            <p className="max-w-xs text-xs">
              Pesan WhatsApp masuk akan muncul otomatis di kolom kiri (refresh tiap 4 detik).
            </p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="-ml-1 rounded-md p-1 text-slate-500 hover:bg-slate-100 md:hidden"
                aria-label="Kembali ke daftar chat"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Avatar lead={lead} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{lead.customer_name || "Tanpa nama"}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{formatPhone(lead.phone_number)}</span>
                  <SourceBadge source={lead.source} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCrmMobile((v) => !v)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 xl:hidden"
                aria-label="Buka panel CRM & CAPI"
              >
                <PanelRight className="h-5 w-5" />
              </button>
            </header>

            {outside24h && (
              <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Pesan terakhir pelanggan sudah lebih dari 24 jam lalu (
                  {Math.floor(hoursSince(lead.last_customer_message_at))} jam). Sesuai aturan 24-hour customer service
                  window WhatsApp Cloud API, pesan teks biasa kemungkinan ditolak Meta — gunakan template message atau
                  tunggu pelanggan membalas.
                </p>
              </div>
            )}

            <div ref={scrollRef} className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4 sm:px-8">
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
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm shadow-sm sm:max-w-[65%] ${
                          outbound ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                          {formatTime(m.created_at)}
                          {outbound && <Check className="h-3 w-3" />}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-200 bg-[#f0f2f5] px-3 py-3 sm:px-4">
              {sendError && (
                <div className="mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1">{sendError}</span>
                  <button type="button" onClick={() => setSendError(null)} aria-label="Tutup">
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
                  placeholder="Ketik balasan..."
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

      {/* ================= KOLOM KANAN: CRM & CAPI ================= */}
      {lead && (
        <>
          {showCrmMobile && (
            <div
              className="fixed inset-0 z-30 bg-slate-900/30 xl:hidden"
              onClick={() => setShowCrmMobile(false)}
              aria-hidden
            />
          )}
          <aside
            className={`${
              showCrmMobile ? "fixed inset-y-0 right-0 z-40 flex" : "hidden"
            } w-full max-w-sm flex-col overflow-y-auto border-l border-slate-200 bg-white xl:static xl:z-auto xl:flex xl:w-[360px] xl:max-w-none xl:shrink-0`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold">CRM & Conversions API</h2>
              <button
                type="button"
                onClick={() => setShowCrmMobile(false)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 xl:hidden"
                aria-label="Tutup panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Atribusi iklan */}
            <section className="border-b border-slate-200 p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Megaphone className="h-3.5 w-3.5" /> Atribusi Iklan
              </h3>
              <dl className="space-y-3">
                <InfoRow label="Source">
                  <SourceBadge source={lead.source} />
                </InfoRow>
                <InfoRow label="CTWA CLID">
                  {lead.ctwa_clid ? (
                    <div className="flex items-start gap-2">
                      <code className="flex-1 break-all rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200">
                        {lead.ctwa_clid}
                      </code>
                      <button
                        type="button"
                        onClick={copyClid}
                        className="shrink-0 rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                        aria-label="Copy CTWA CLID"
                        title="Copy"
                      >
                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </InfoRow>
                <InfoRow label="Ad ID">
                  {lead.ad_id ? <span className="font-mono text-xs">{lead.ad_id}</span> : <span className="text-slate-400">—</span>}
                </InfoRow>
                <InfoRow label="Ad Headline">
                  {lead.ad_headline || <span className="text-slate-400">—</span>}
                </InfoRow>
              </dl>
            </section>

            {/* Form aksi CS */}
            <section className="border-b border-slate-200 p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <UserRound className="h-3.5 w-3.5" /> Aksi CS
              </h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveCapi();
                }}
                className="space-y-3"
              >
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Status Lead</span>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as LeadStatus)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                        {s === "qualified" ? " → event Lead" : s === "closing" ? " → event Purchase" : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Deal Value (IDR)</span>
                  <div className="flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
                    <span className="pl-3 text-sm text-slate-500">Rp</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formDeal ? idrFormatter.format(formDeal) : ""}
                      onChange={(e) => setFormDeal(parseDigits(e.target.value))}
                      placeholder="0"
                      className="w-full rounded-lg bg-transparent px-2 py-2 text-right text-sm tabular-nums outline-none"
                    />
                  </div>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    Tersimpan: {formatIdr(Number(lead.deal_value) || 0)}
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Simpan & Kirim CAPI
                </button>
                {formDirty && !saving && (
                  <p className="text-[11px] text-amber-700">Ada perubahan yang belum disimpan.</p>
                )}
                {lead.source !== "meta_ads" && (
                  <p className="text-[11px] text-slate-500">
                    Lead organik hanya disimpan ke database, tidak dikirim ke Meta CAPI.
                  </p>
                )}

                {capiNotice && (
                  <div
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      capiNotice.type === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : capiNotice.type === "error"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    {capiNotice.text}
                  </div>
                )}
              </form>
            </section>

            {/* Status CAPI */}
            <section className="p-4">
              <h3 className="mb-3 text-xs font-semibold text-slate-700">Event CAPI Terkirim</h3>
              <div className="flex flex-wrap gap-2">
                {(["Lead", "Purchase"] as const).map((ev) => {
                  const sent = (lead.capi_sent_events ?? []).includes(ev);
                  return (
                    <Badge
                      key={ev}
                      className={sent ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-slate-400 ring-slate-200"}
                    >
                      {sent ? <CheckCircle2 className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />}
                      {ev} {sent ? "Sent" : "Belum"}
                    </Badge>
                  );
                })}
              </div>

              <h3 className="mb-2 mt-5 text-xs font-semibold text-slate-700">last_capi_response</h3>
              <pre className="max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
                {lead.last_capi_response ? JSON.stringify(lead.last_capi_response, null, 2) : "// Belum ada request CAPI"}
              </pre>
            </section>
          </aside>
        </>
      )}
    </main>
  );
}
