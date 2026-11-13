import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorMessage, GRAPH_API_VERSION, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SendBody {
  lead_id?: string;
  text?: string;
}

interface WaSendResponse {
  messages?: Array<{ id: string }>;
  error?: { message?: string; code?: number; error_subcode?: number; type?: string };
}

export async function POST(req: NextRequest) {
  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return jsonError("Body harus berupa JSON.");
  }

  const leadId = body.lead_id?.trim();
  const text = body.text?.trim();
  if (!leadId) return jsonError("lead_id wajib diisi.");
  if (!text) return jsonError("text wajib diisi.");
  if (text.length > 4096) return jsonError("text maksimal 4096 karakter.");

  try {
    const supabase = getSupabaseAdmin();

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, phone_number")
      .eq("id", leadId)
      .maybeSingle();
    if (leadError) throw leadError;
    if (!lead) return jsonError("Lead tidak ditemukan.", 404);

    const mockMode = process.env.MOCK_MODE === "true";
    let waMessageId: string | null = null;

    if (!mockMode) {
      const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
      const accessToken = process.env.WA_ACCESS_TOKEN;
      if (!phoneNumberId || !accessToken) {
        return jsonError("WA_PHONE_NUMBER_ID dan WA_ACCESS_TOKEN wajib diisi (atau set MOCK_MODE=true).", 500);
      }

      const waRes = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: lead.phone_number,
            type: "text",
            text: { preview_url: false, body: text },
          }),
          cache: "no-store",
        },
      );

      const waJson = (await waRes.json().catch(() => ({}))) as WaSendResponse;
      if (!waRes.ok) {
        return jsonError(
          waJson.error?.message ?? `WhatsApp API error (HTTP ${waRes.status})`,
          waRes.status >= 400 && waRes.status < 600 ? waRes.status : 502,
          { meta_error: waJson.error ?? waJson },
        );
      }
      waMessageId = waJson.messages?.[0]?.id ?? null;
    }

    const { data: message, error: msgError } = await supabase
      .from("messages")
      .insert({
        lead_id: lead.id,
        wa_message_id: waMessageId,
        direction: "outbound",
        content: text,
      })
      .select("*")
      .single();
    if (msgError) throw msgError;

    return NextResponse.json({ ok: true, mock: mockMode, message });
  } catch (err) {
    console.error("[messages/send]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}
