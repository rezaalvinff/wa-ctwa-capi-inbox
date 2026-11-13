import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hashPhone } from "@/lib/phone";
import { errorMessage, GRAPH_API_VERSION, jsonError } from "@/lib/http";
import { LEAD_STATUSES, type CapiEventName, type Lead, type LeadStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CapiBody {
  lead_id?: string;
  status?: string;
  deal_value?: number | string;
}

export async function POST(req: NextRequest) {
  let body: CapiBody;
  try {
    body = (await req.json()) as CapiBody;
  } catch {
    return jsonError("Body harus berupa JSON.");
  }

  const leadId = body.lead_id?.trim();
  const status = body.status as LeadStatus | undefined;
  const dealValue = Number(body.deal_value ?? 0);

  if (!leadId) return jsonError("lead_id wajib diisi.");
  if (!status || !LEAD_STATUSES.includes(status)) {
    return jsonError(`status harus salah satu dari: ${LEAD_STATUSES.join(", ")}.`);
  }
  if (!Number.isFinite(dealValue) || dealValue < 0) {
    return jsonError("deal_value harus berupa angka >= 0.");
  }

  try {
    const supabase = getSupabaseAdmin();

    // 1. Update status & deal_value terlebih dahulu.
    const { data: updated, error: updateError } = await supabase
      .from("leads")
      .update({ status, deal_value: dealValue })
      .eq("id", leadId)
      .select("*")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return jsonError("Lead tidak ditemukan.", 404);

    const lead = updated as Lead;

    // 2. Validasi: hanya qualified/closing + meta_ads + ctwa_clid yang dikirim ke CAPI.
    if (status !== "qualified" && status !== "closing") {
      return NextResponse.json({
        ok: true,
        capi_sent: false,
        reason: `Status '${status}' tidak memicu event CAPI. Database diperbarui.`,
        lead,
      });
    }
    if (lead.source !== "meta_ads" || !lead.ctwa_clid) {
      return NextResponse.json({
        ok: true,
        capi_sent: false,
        reason: "Lead bukan dari iklan CTWA (source bukan meta_ads atau ctwa_clid kosong). Database diperbarui tanpa mengirim CAPI.",
        lead,
      });
    }

    const eventName: CapiEventName = status === "qualified" ? "Lead" : "Purchase";
    const sentEvents = Array.isArray(lead.capi_sent_events) ? lead.capi_sent_events : [];

    // 3. Cegah duplikasi event.
    if (sentEvents.includes(eventName)) {
      return NextResponse.json({
        ok: true,
        capi_sent: false,
        already_sent: true,
        event_name: eventName,
        reason: `Event '${eventName}' sudah pernah terkirim untuk lead ini. Tidak dikirim ulang.`,
        lead,
      });
    }

    const datasetId = process.env.META_DATASET_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;
    if (!datasetId || !accessToken) {
      const log = {
        event_name: eventName,
        http_status: null,
        sent_at: new Date().toISOString(),
        error: "META_DATASET_ID dan META_ACCESS_TOKEN belum diisi di environment variables.",
      };
      const { data: logged } = await supabase
        .from("leads")
        .update({ last_capi_response: log })
        .eq("id", lead.id)
        .select("*")
        .single();
      return jsonError(log.error, 500, { lead: logged ?? lead });
    }

    // 4. Susun payload CAPI untuk CTWA.
    const userData: Record<string, unknown> = {
      ph: [hashPhone(lead.phone_number)],
      ctwa_clid: lead.ctwa_clid, // tidak di-hash
    };
    if (process.env.WA_BUSINESS_ACCOUNT_ID) {
      userData.whatsapp_business_account_id = process.env.WA_BUSINESS_ACCOUNT_ID;
    }

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: `${lead.id}_${eventName}`,
          action_source: "business_messaging",
          messaging_channel: "whatsapp",
          user_data: userData,
          custom_data: {
            currency: "IDR",
            value: Number(dealValue) || 0,
          },
        },
      ],
    };
    const testEventCode = process.env.META_TEST_EVENT_CODE?.trim();
    if (testEventCode) payload.test_event_code = testEventCode;

    // 5. Kirim ke Meta.
    let httpStatus = 0;
    let responseJson: unknown;
    try {
      const metaRes = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${datasetId}/events?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
      );
      httpStatus = metaRes.status;
      const text = await metaRes.text();
      try {
        responseJson = JSON.parse(text);
      } catch {
        responseJson = { raw: text };
      }
    } catch (fetchErr) {
      responseJson = { error: { message: `Network error: ${errorMessage(fetchErr)}` } };
    }

    const success = httpStatus === 200;
    const capiLog = {
      event_name: eventName,
      http_status: httpStatus || null,
      success,
      sent_at: new Date().toISOString(),
      test_event_code: testEventCode || null,
      request_payload: payload, // tanpa access token
      response: responseJson,
    };

    const { data: finalLead, error: logError } = await supabase
      .from("leads")
      .update({
        last_capi_response: capiLog,
        ...(success ? { capi_sent_events: [...sentEvents, eventName] } : {}),
      })
      .eq("id", lead.id)
      .select("*")
      .single();
    if (logError) throw logError;

    return NextResponse.json(
      {
        ok: success,
        capi_sent: success,
        event_name: eventName,
        http_status: httpStatus || null,
        meta_response: responseJson,
        ...(success ? {} : { error: "Meta CAPI mengembalikan error. Lihat meta_response." }),
        lead: finalLead,
      },
      { status: success ? 200 : 502 },
    );
  } catch (err) {
    console.error("[capi]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}
