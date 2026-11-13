import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorMessage, jsonError } from "@/lib/http";
import { isMockMode } from "@/lib/config";
import { sendWhatsAppText } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SendBody {
  lead_id?: string;
  text?: string;
}

/** POST /api/messages/send - balasan manual CS (sender_type: 'cs'). */
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
      .select("id, phone_number, is_simulated")
      .eq("id", leadId)
      .maybeSingle();
    if (leadError) throw leadError;
    if (!lead) return jsonError("Lead tidak ditemukan.", 404);

    // Lead simulasi tidak pernah dikirim ke WhatsApp (nomor acak bisa milik orang lain).
    const mock = isMockMode() || Boolean(lead.is_simulated);
    let waMessageId: string | null = null;

    if (!mock) {
      const sent = await sendWhatsAppText(lead.phone_number, text);
      if (!sent.ok) {
        return jsonError(sent.error ?? "Gagal mengirim ke WhatsApp.", sent.status >= 400 ? sent.status : 502, {
          meta_error: sent.raw,
        });
      }
      waMessageId = sent.wa_message_id;
    }

    const { data: message, error: msgError } = await supabase
      .from("messages")
      .insert({
        lead_id: lead.id,
        wa_message_id: waMessageId,
        direction: "outbound",
        sender_type: "cs",
        content: text,
      })
      .select("*")
      .single();
    if (msgError) throw msgError;

    return NextResponse.json({ ok: true, mock, message });
  } catch (err) {
    console.error("[messages/send]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}
