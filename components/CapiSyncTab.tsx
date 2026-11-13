"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileJson,
  Flame,
  Loader2,
  MessageCircle,
  RefreshCw,
  Rocket,
  X,
  XCircle,
} from "lucide-react";
import type { AppConfig, CapiSyncSummary, WarmCapiLead } from "@/lib/types";
import { Badge, CopyButton, SourceBadge, api, displayName, errText, formatDateTime, relativeTime } from "@/components/ui";

const POLL_INTERVAL_MS = 15000;

type StateFilter = "all" | "pending" | "sent";

interface WarmLeadsResponse {
  stats: { total: number; pending: number; sent: number };
  leads: WarmCapiLead[];
}

function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>{icon}</div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{hint}</p>
    </div>
  );
}

export default function CapiSyncTab({
  active,
  config,
  onOpenLead,
}: {
  active: boolean;
  config: AppConfig | null;
  onOpenLead: (id: string) => void;
}) {
  const [data, setData] = useState<WarmLeadsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<CapiSyncSummary | null>(null);
  const [filter, setFilter] = useState<StateFilter>("all");
  const [modalLead, setModalLead] = useState<WarmCapiLead | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<WarmLeadsResponse>("/api/capi/warm-leads");
      setData(res);
      setLoadError(null);
    } catch (err) {
      setLoadError(errText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") void load();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, load]);

  useEffect(() => {
    if (!modalLead) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setModalLead(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalLead]);

  async function runSync() {
    setSyncing(true);
    setSummary(null);
    try {
      const res = await fetch("/api/capi/sync-warm", { method: "POST", cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as CapiSyncSummary;
      setSummary(json);
    } catch (err) {
      setSummary({
        ok: false,
        trigger: "manual",
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        total_eligible: 0,
        total_sent: 0,
        total_failed: 0,
        results: [],
        error: errText(err),
      });
    } finally {
      setSyncing(false);
      void load();
    }
  }

  const rows = useMemo(
    () => (data?.leads ?? []).filter((l) => filter === "all" || l.capi_state === filter),
    [data, filter],
  );
  const stats = data?.stats ?? { total: 0, pending: 0, sent: 0 };
  const windowDays = config?.capi_window_days ?? 7;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Meta CAPI Sync — CTWA Warm {windowDays} Hari</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Hanya prospek <b>WARM</b> dari <b>Click-to-WhatsApp Meta Ads</b> (ctwa_clid terisi) yang masuk/aktif dalam {windowDays} hari
            terakhir. Prospek organik dan cold tidak dikirim.
          </p>
        </div>

        {/* Statistik */}
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label={`Total Warm CTWA Meta Ads (${windowDays} hari)`}
            value={stats.total}
            hint="status warm + source meta_ads + ctwa_clid"
            icon={<Flame className="h-5 w-5 text-orange-600" />}
            tone="bg-orange-50"
          />
          <StatCard
            label="Siap Kirim CAPI (Pending Sync)"
            value={stats.pending}
            hint="belum ada event 'Lead' di capi_sent_events"
            icon={<Clock className="h-5 w-5 text-amber-600" />}
            tone="bg-amber-50"
          />
          <StatCard
            label="Sudah Terkirim ke Meta (Lead Sent)"
            value={stats.sent}
            hint="event 'Lead' sukses (HTTP 200)"
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            tone="bg-emerald-50"
          />
        </div>

        {/* Banner aksi */}
        <div className="rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2 text-sm text-slate-700">
              <p className="flex items-center gap-2 font-medium text-slate-900">
                <CalendarClock className="h-4 w-4 text-red-600" />
                Auto-sync harian: {config?.cron_label ?? "Setiap hari (Vercel Cron)"}
              </p>
              <p className="text-xs text-slate-500">
                Event <code className="rounded bg-white px-1 ring-1 ring-slate-200">Lead</code> dengan action_source{" "}
                <code className="rounded bg-white px-1 ring-1 ring-slate-200">business_messaging</code>, nomor HP di-hash SHA-256,
                content_name = unit, content_category = domisili. Setiap lead hanya dikirim sekali.
              </p>
              <div className="flex flex-wrap gap-2">
                {config && !config.capi_configured && (
                  <Badge className="bg-red-50 text-red-700 ring-red-200">
                    <AlertTriangle className="h-3 w-3" /> META_DATASET_ID / META_ACCESS_TOKEN belum diisi
                  </Badge>
                )}
                {config?.test_event_code && (
                  <Badge className="bg-violet-50 text-violet-700 ring-violet-200">Test Event Code aktif</Badge>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={runSync}
              disabled={syncing || stats.pending === 0}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 lg:max-w-md"
            >
              {syncing ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : <Rocket className="h-5 w-5 shrink-0" />}
              <span>
                Auto-Send Semua Prospek Warm CTWA ({windowDays} Hari Terakhir) ke Meta CAPI
                {stats.pending > 0 && ` · ${stats.pending}`}
              </span>
            </button>
          </div>

          {summary && (
            <div
              className={`mt-4 rounded-lg border px-3 py-2.5 text-xs ${
                summary.ok && summary.total_failed === 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              <p className="font-semibold">
                Hasil sync: {summary.total_eligible} eligible · {summary.total_sent} terkirim · {summary.total_failed} gagal
              </p>
              {summary.error && <p className="mt-1">{summary.error}</p>}
              {summary.results.some((r) => !r.success) && (
                <ul className="mt-1.5 list-inside list-disc space-y-0.5">
                  {summary.results
                    .filter((r) => !r.success)
                    .slice(0, 10)
                    .map((r) => (
                      <li key={r.lead_id}>
                        {r.customer_name ?? r.phone_number}: {r.error ?? `HTTP ${r.http_status}`}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Tabel */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-800">Monitoring Prospek Warm CTWA ({windowDays} Hari)</h3>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    ["all", `Semua (${stats.total})`],
                    ["pending", `Pending (${stats.pending})`],
                    ["sent", `Sent (${stats.sent})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      filter === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => load()}
                className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                aria-label="Muat ulang"
                title="Muat ulang"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {loadError && <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{loadError}</div>}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Nama Prospek</th>
                  <th className="px-4 py-2.5 font-medium">Nomor Telepon</th>
                  <th className="px-4 py-2.5 font-medium">Domisili & Unit</th>
                  <th className="px-4 py-2.5 font-medium">Source & Ad Info</th>
                  <th className="px-4 py-2.5 font-medium">CTWA CLID</th>
                  <th className="px-4 py-2.5 font-medium">Masuk / Update</th>
                  <th className="px-4 py-2.5 font-medium">Status CAPI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                      Belum ada prospek warm CTWA dalam {windowDays} hari terakhir
                      {filter !== "all" ? " untuk filter ini" : ""}.
                    </td>
                  </tr>
                )}
                {!data && !loadError && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                )}
                {rows.map((l) => (
                  <tr key={l.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onOpenLead(l.id)}
                        className="inline-flex items-center gap-1 text-left font-semibold text-slate-900 hover:text-red-600"
                        title="Buka roomchat"
                      >
                        {displayName(l)}
                        <MessageCircle className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                      {l.is_simulated && <p className="text-[11px] text-violet-600">Lead simulasi</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs">{l.phone_number}</span>
                        <CopyButton value={l.phone_number} label="Copy nomor telepon" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-800">📍 {l.domicile}</p>
                      <p className="text-slate-800">🚗 {l.interested_unit}</p>
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge source={l.source} />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Ad ID: <span className="font-mono">{l.ad_id || "—"}</span>
                      </p>
                      <p className="max-w-[200px] truncate text-[11px] text-slate-500" title={l.ad_headline ?? ""}>
                        {l.ad_headline || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <code className="whitespace-nowrap rounded bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200" title={l.ctwa_clid ?? ""}>
                          {l.ctwa_clid ? `${l.ctwa_clid.slice(0, 10)}…${l.ctwa_clid.slice(-6)}` : "—"}
                        </code>
                        {l.ctwa_clid && <CopyButton value={l.ctwa_clid} label="Copy full CTWA CLID" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <p>Masuk: {formatDateTime(l.created_at)}</p>
                      <p>Chat: {relativeTime(l.last_customer_message_at)}</p>
                      {l.warm_at && <p className="text-orange-600">Warm: {formatDateTime(l.warm_at)}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {l.capi_state === "sent" ? (
                        <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> Lead Sent
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-50 text-amber-700 ring-amber-200">
                          <Clock className="h-3 w-3" /> Pending Sync
                        </Badge>
                      )}
                      {l.capi_synced_at && <p className="mt-1 text-[11px] text-slate-500">{formatDateTime(l.capi_synced_at)}</p>}
                      {l.capi_state === "pending" && l.last_capi_response && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-red-600">
                          <XCircle className="h-3 w-3" /> Percobaan terakhir gagal
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => setModalLead(l)}
                        disabled={!l.last_capi_response}
                        className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                      >
                        <FileJson className="h-3 w-3" /> Lihat Response Meta
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal log JSON */}
      {modalLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setModalLead(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Response Meta CAPI"
            className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">last_capi_response</h3>
                <p className="truncate text-xs text-slate-500">
                  {displayName(modalLead)} · {modalLead.phone_number}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalLead(null)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre className="m-4 flex-1 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
              {JSON.stringify(modalLead.last_capi_response, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
