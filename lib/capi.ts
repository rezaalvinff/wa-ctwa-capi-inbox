/**
 * Meta Conversions API — batch sync event 'Lead' untuk prospek WARM dari
 * Click-to-WhatsApp Meta Ads dalam 7 hari terakhir.
 */
import { getSupabaseAdmin } from "@/lib/supabase";
import { hashPhone } from "@/lib/phone";
import { CAPI_WINDOW_DAYS, hasCapiConfig } from "@/lib/config";
import { GRAPH_API_VERSION, errorMessage } from "@/lib/http";
import type { CapiSyncLeadLog, CapiSyncSummary, Lead, WarmCapiLead } from "@/lib/types";

const EVENT_NAME = "Lead";
const MAX_LEADS_PER_RUN = 500;
const CONCURRENCY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export function capiWindowStart(now = Date.now()): Date {
  return new Date(now - CAPI_WINDOW_DAYS * DAY_MS);
}

function sentEvents(lead: Lead): string[] {
  return Array.isArray(lead.capi_sent_events) ? lead.capi_sent_events : [];
}

/** Syarat 1-4: warm + meta_ads + ctwa_clid terisi + aktif dalam 7 hari terakhir. */
export function isWarmCtwaInWindow(lead: Lead, since = capiWindowStart()): boolean {
  const sinceMs = since.getTime();
  return (
    lead.status === "warm" &&
    lead.source === "meta_ads" &&
    typeof lead.ctwa_clid === "string" &&
    lead.ctwa_clid.trim() !== "" &&
    (new Date(lead.created_at).getTime() >= sinceMs || new Date(lead.last_customer_message_at).getTime() >= sinceMs)
  );
}

/** Semua prospek warm CTWA 7 hari terakhir (pending + sudah terkirim). */
export async function fetchWarmCtwaLeads(): Promise<WarmCapiLead[]> {
  const since = capiWindowStart();
  const sinceIso = since.toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("leads")
    .select("*")
    .eq("status", "warm")
    .eq("source", "meta_ads")
    .not("ctwa_clid", "is", null)
    .neq("ctwa_clid", "")
    .or(`created_at.gte."${sinceIso}",last_customer_message_at.gte."${sinceIso}"`)
    .order("warm_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;

  return ((data ?? []) as Lead[])
    .filter((lead) => isWarmCtwaInWindow(lead, since))
    .map((lead) => ({ ...lead, capi_state: sentEvents(lead).includes(EVENT_NAME) ? "sent" : "pending" }));
}

/** event_time = waktu lead menjadi warm (bila masih dalam 7 hari), selain itu sekarang. */
function eventTime(lead: Lead): number {
  const now = Date.now();
  const warmAt = lead.warm_at ? new Date(lead.warm_at).getTime() : NaN;
  const minAllowed = now - CAPI_WINDOW_DAYS * DAY_MS + 60 * 60 * 1000; // margin 1 jam
  const t = Number.isFinite(warmAt) && warmAt >= minAllowed && warmAt <= now ? warmAt : now;
  return Math.floor(t / 1000);
}

function buildPayload(lead: Lead): Record<string, unknown> {
  const userData: Record<string, unknown> = {
    ph: [hashPhone(lead.phone_number)],
    ctwa_clid: lead.ctwa_clid, // tidak di-hash
  };
  if (process.env.WA_BUSINESS_ACCOUNT_ID?.trim()) {
    userData.whatsapp_business_account_id = process.env.WA_BUSINESS_ACCOUNT_ID.trim();
  }

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: EVENT_NAME,
        event_time: eventTime(lead),
        event_id: `${lead.id}_${EVENT_NAME}`,
        action_source: "business_messaging",
        messaging_channel: "whatsapp",
        user_data: userData,
        custom_data: {
          content_name: lead.interested_unit,
          content_category: lead.domicile,
        },
      },
    ],
  };
  const testEventCode = process.env.META_TEST_EVENT_CODE?.trim();
  if (testEventCode) payload.test_event_code = testEventCode;
  return payload;
}

async function sendLeadEvent(lead: Lead): Promise<CapiSyncLeadLog> {
  const supabase = getSupabaseAdmin();
  const payload = buildPayload(lead);

  let httpStatus = 0;
  let response: unknown;
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.META_DATASET_ID}/events?access_token=${encodeURIComponent(
        process.env.META_ACCESS_TOKEN ?? "",
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      },
    );
    httpStatus = res.status;
    const text = await res.text();
    try {
      response = JSON.parse(text);
    } catch {
      response = { raw: text };
    }
  } catch (err) {
    response = { error: { message: `Network error: ${errorMessage(err)}` } };
  }

  const success = httpStatus === 200;
  const sentAt = new Date().toISOString();
  const log = {
    event_name: EVENT_NAME,
    http_status: httpStatus || null,
    success,
    sent_at: sentAt,
    test_event_code: process.env.META_TEST_EVENT_CODE?.trim() || null,
    request_payload: payload, // tanpa access token
    response,
  };

  const { error } = await supabase
    .from("leads")
    .update({
      last_capi_response: log,
      ...(success
        ? { capi_sent_events: Array.from(new Set([...sentEvents(lead), EVENT_NAME])), capi_synced_at: sentAt }
        : {}),
    })
    .eq("id", lead.id);

  const metaError = (response as { error?: { message?: string } } | undefined)?.error?.message;
  return {
    lead_id: lead.id,
    phone_number: lead.phone_number,
    customer_name: lead.customer_name,
    success: success && !error,
    http_status: httpStatus || null,
    ...(success ? {} : { error: metaError ?? `HTTP ${httpStatus || "network error"}` }),
    ...(error ? { error: `Terkirim ke Meta tetapi gagal menyimpan log: ${error.message}` } : {}),
    response,
  };
}

/** Kirim event 'Lead' untuk semua prospek warm CTWA 7 hari terakhir yang belum terkirim. */
export async function syncWarmLeads(trigger: "manual" | "cron"): Promise<CapiSyncSummary> {
  const startedAt = new Date().toISOString();
  const base = { trigger, started_at: startedAt };

  try {
    const pending = (await fetchWarmCtwaLeads()).filter((l) => l.capi_state === "pending");
    const batch = pending.slice(0, MAX_LEADS_PER_RUN);

    if (!hasCapiConfig()) {
      return {
        ...base,
        ok: false,
        finished_at: new Date().toISOString(),
        total_eligible: pending.length,
        total_sent: 0,
        total_failed: 0,
        results: [],
        error: "META_DATASET_ID dan META_ACCESS_TOKEN belum diisi di environment variables.",
      };
    }

    const results: CapiSyncLeadLog[] = [];
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const chunk = batch.slice(i, i + CONCURRENCY);
      results.push(...(await Promise.all(chunk.map((lead) => sendLeadEvent(lead)))));
    }

    const totalSent = results.filter((r) => r.success).length;
    return {
      ...base,
      ok: true,
      finished_at: new Date().toISOString(),
      total_eligible: pending.length,
      total_sent: totalSent,
      total_failed: results.length - totalSent,
      results,
      ...(pending.length > batch.length
        ? { error: `Hanya ${batch.length} dari ${pending.length} lead diproses di run ini; sisanya di run berikutnya.` }
        : {}),
    };
  } catch (err) {
    return {
      ...base,
      ok: false,
      finished_at: new Date().toISOString(),
      total_eligible: 0,
      total_sent: 0,
      total_failed: 0,
      results: [],
      error: errorMessage(err),
    };
  }
}
