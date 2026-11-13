import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorMessage, jsonError } from "@/lib/http";
import { isMockMode } from "@/lib/config";
import { runBotForInbound } from "@/lib/bot-engine";
import { simulateCustomerReply } from "@/lib/chatbot";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/simulate/reply
 * Body: { "lead_id": "...", "text"?: "..." }
 * Menyimulasikan pesan masuk dari pelanggan (teks otomatis bila kosong),
 * lalu chatbot memprosesnya (jika bot_active). Hanya untuk MOCK_MODE atau lead simulasi.
 */
export async function POST(req: NextRequest) {
  let body: { lead_id?: string; text?: string };
  try {
    body = (await req.json()) as { lead_id?: string; text?: string };
  } catch {
    return jsonError("Body harus berupa JSON.");
  }
  const leadId = body.lead_id?.trim();
  if (!leadId) return jsonError("lead_id wajib diisi.");

  try {
    const supabase = getSupabaseAdmin();
    const { data: leadRow, error: leadError } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
    if (leadError) throw leadError;
    if (!leadRow) return jsonError("Lead tidak ditemukan.", 404);
    const lead = leadRow as Lead;

    if (!isMockMode() && !lead.is_simulated) {
      return jsonError(
        "Simulasi balasan customer hanya tersedia saat MOCK_MODE=true atau untuk lead simulasi (agar bot tidak membalas pelanggan asli dengan pesan palsu).",
        403,
      );
    }

    const text = body.text?.trim().slice(0, 4096) || simulateCustomerReply(lead);
    const now = new Date().toISOString();

    const { data: message, error: msgError } = await supabase
      .from("messages")
      .insert({
        lead_id: lead.id,
        wa_message_id: `wamid.SIMULATED_${randomBytes(12).toString("hex")}`,
        direction: "inbound",
        sender_type: "customer",
        content: text,
        created_at: now,
      })
      .select("*")
      .single();
    if (msgError) throw msgError;

    const { error: touchError } = await supabase
      .from("leads")
      .update({ last_customer_message_at: now })
      .eq("id", lead.id);
    if (touchError) throw touchError;

    const bot = await runBotForInbound(lead.id, message.id);

    return NextResponse.json({ ok: true, message, bot });
  } catch (err) {
    console.error("[simulate/reply]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}
