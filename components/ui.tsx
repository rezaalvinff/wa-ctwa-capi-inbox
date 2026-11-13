"use client";

import { useState } from "react";
import { Check, Copy, Megaphone, Sprout } from "lucide-react";
import type { Lead, LeadSource, LeadStatus } from "@/lib/types";

// ---------------------------------------------------------------------
// Formatter & fetch helper (client)
// ---------------------------------------------------------------------
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatListTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return formatTime(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

export function formatDateDivider(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}

export function displayName(lead: Pick<Lead, "customer_name" | "wa_profile_name" | "phone_number">): string {
  return lead.customer_name?.trim() || lead.wa_profile_name?.trim() || `+${lead.phone_number}`;
}

export function initials(lead: Pick<Lead, "customer_name" | "wa_profile_name" | "phone_number">): string {
  const base = (lead.customer_name || lead.wa_profile_name || "").replace(/\(.*?\)/g, "").trim();
  if (!base) return lead.phone_number.slice(-2);
  return base
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
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

export function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------
// Komponen
// ---------------------------------------------------------------------
export function Badge({ className, children, title }: { className: string; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  );
}

const SOURCE_STYLE: Record<LeadSource, string> = {
  meta_ads: "bg-blue-50 text-blue-700 ring-blue-200",
  organic: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const SOURCE_LABEL: Record<LeadSource, Record<"long" | "short", string>> = {
  meta_ads: { long: "Meta Ads - Click to WhatsApp", short: "Meta Ads CTWA" },
  organic: { long: "Organik", short: "Organik" },
};

export function SourceBadge({ source, variant = "short" }: { source: LeadSource; variant?: "long" | "short" }) {
  return (
    <Badge className={SOURCE_STYLE[source]}>
      {source === "meta_ads" ? <Megaphone className="h-3 w-3" /> : <Sprout className="h-3 w-3" />}
      {SOURCE_LABEL[source][variant]}
    </Badge>
  );
}

const STATUS_STYLE: Record<LeadStatus, string> = {
  warm: "bg-orange-50 text-orange-700 ring-orange-300",
  cold: "bg-sky-50 text-sky-700 ring-sky-200",
};

export function StatusTag({ status }: { status: LeadStatus }) {
  return (
    <Badge className={`${STATUS_STYLE[status]} font-bold tracking-wide`}>
      {status === "warm" ? "🔥 WARM" : "❄️ COLD"}
    </Badge>
  );
}

export function Avatar({ lead, size = "md" }: { lead: Lead; size?: "md" | "lg" }) {
  const dims = size === "lg" ? "h-11 w-11 text-sm" : "h-10 w-10 text-xs";
  const color = lead.source === "meta_ads" ? "bg-blue-600" : "bg-emerald-600";
  return (
    <div className={`${dims} ${color} relative flex shrink-0 items-center justify-center rounded-full font-semibold text-white`}>
      {initials(lead)}
      {lead.status === "warm" && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] ring-1 ring-orange-200">
          🔥
        </span>
      )}
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
      aria-label={label}
      title={copied ? "Tersalin" : label}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800">{children}</dd>
    </div>
  );
}

export function Card({ title, icon, children, action }: { title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}
