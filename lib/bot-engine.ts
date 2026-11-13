/**
 * Orkestrasi chatbot: baca lead + riwayat chat, panggil lib/chatbot.ts,
 * simpan data kualifikasi, auto-tag cold/warm, handoff, dan kirim balasan.
 */
import { getSupabaseAdmin } from "@/lib/supabase";
import { isMockMode } from "@/lib/config";
import { buildHandoffMessage, generateBotReply, type ChatTurn } from "@/lib/chatbot";
import { computeStatus, isFilled } from "@/lib/leads";
import { normalizeDomicile, normalizeName, normalizeUnit } from "@/lib/mitsubishi";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { loadActiveKnowledge } from "@/lib/knowledge";
import { autoAssignLead, type AgentCandidate } from "@/lib/routing";
import type { Lead, Message } from "@/lib/types";

export interface BotRunResult {
  ran: boolean;
  skipped_reason?: "lead_not_found" | "bot_inactive" | "newer_message";
  engine?: "gemini" | "rules";
  engine_error?: string;
  extracted?: { customer_name: string | null; domicile: string | null; interested_unit: string | null };
  became_warm?: boolean;
  /** Agent yang menerima lead saat menjadi WARM (null = Antrian Admin). */
  assigned_agent?: Pick<AgentCandidate, "id" | "full_name"> | null;
  lead?: Lead;
  reply?: Message;
}

const HISTORY_LIMIT = 40;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** id pesan inbound terbaru milik lead (tie-break id agar deterministik). */
async function latestInboundId(leadId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("messages")
    .select("id")
    .eq("lead_id", leadId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0]?.id as string | undefined) ?? null;
}

/**
 * Jalankan chatbot untuk pesan inbound tertentu.
 * Jika pelanggan mengirim beberapa pesan beruntun, hanya pesan TERAKHIR yang
 * dibalas (pesan sebelumnya tetap dibaca sebagai konteks) agar bot tidak spam.
 */
export async function runBotForInbound(
  leadId: string,
  triggerMessageId: string,
  options: { debounceMs?: number } = {},
): Promise<BotRunResult> {
  const supabase = getSupabaseAdmin();
  if (options.debounceMs) await sleep(options.debounceMs);

  const { data: leadRow, error: leadError } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (leadError) throw leadError;
  if (!leadRow) return { ran: false, skipped_reason: "lead_not_found" };
  const lead = leadRow as Lead;
  if (!lead.bot_active) return { ran: false, skipped_reason: "bot_inactive", lead };

  if ((await latestInboundId(leadId)) !== triggerMessageId) {
    return { ran: false, skipped_reason: "newer_message", lead };
  }

  const { data: historyRows, error: historyError } = await supabase
    .from("messages")
    .select("sender_type, content, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (historyError) throw historyError;
  const history: ChatTurn[] = ((historyRows ?? []) as Array<{ sender_type: ChatTurn["sender"]; content: string; created_at: string }>)
    .map((m) => ({ sender: m.sender_type, content: m.content, created_at: m.created_at }))
    .reverse();

  const knowledge = await loadActiveKnowledge();
  const result = await generateBotReply({ lead, history, knowledge: knowledge.text });

  // Isi hanya data yang masih kosong.
  const patch: Partial<Lead> = {};
  const name = isFilled(lead.customer_name) ? null : normalizeName(result.extracted_name);
  const domicile = isFilled(lead.domicile) ? null : normalizeDomicile(result.extracted_domicile);
  const unit = isFilled(lead.interested_unit) ? null : normalizeUnit(result.extracted_unit);
  if (name) patch.customer_name = name;
  if (domicile) patch.domicile = domicile;
  if (unit) patch.interested_unit = unit;

  // Cek ulang: ada pesan baru / CS mengambil alih selama LLM berpikir?
  const { data: fresh, error: freshError } = await supabase
    .from("leads")
    .select("bot_active")
    .eq("id", leadId)
    .single();
  if (freshError) throw freshError;
  if (!fresh.bot_active) return { ran: false, skipped_reason: "bot_inactive", lead };
  if ((await latestInboundId(leadId)) !== triggerMessageId) {
    return { ran: false, skipped_reason: "newer_message", lead };
  }

  const merged = { ...lead, ...patch };
  const newStatus = computeStatus(merged);
  const becameWarm = lead.status !== "warm" && newStatus === "warm";

  let updatedLead = lead;
  if (Object.keys(patch).length > 0 || newStatus !== lead.status) {
    const { data: updated, error: updateError } = await supabase
      .from("leads")
      .update({
        ...patch,
        status: newStatus,
        ...(becameWarm ? { bot_active: false, warm_at: new Date().toISOString() } : {}),
      })
      .eq("id", leadId)
      .select("*")
      .single();
    if (updateError) throw updateError;
    updatedLead = updated as Lead;
  }

  // Lead WARM -> oper otomatis ke agent yang wilayahnya cocok dengan domisili.
  let assignedAgent: AgentCandidate | null = null;
  if (becameWarm) {
    try {
      assignedAgent = await autoAssignLead(updatedLead);
      if (assignedAgent) {
        updatedLead = { ...updatedLead, assigned_agent_id: assignedAgent.id, assigned_at: new Date().toISOString() };
      }
    } catch (err) {
      console.error("[bot-engine] auto-assign gagal:", err instanceof Error ? err.message : String(err));
    }
  }

  // Saat handoff, pertanyaan pelanggan di pesan yang sama tetap dijawab lebih dulu.
  const replyText = becameWarm
    ? [result.answer_to_question, buildHandoffMessage(updatedLead)].filter(Boolean).join("\n\n")
    : result.reply_message;

  let waMessageId: string | null = null;
  let sendError: string | null = null;
  if (!isMockMode() && !lead.is_simulated) {
    const sent = await sendWhatsAppText(lead.phone_number, replyText);
    waMessageId = sent.wa_message_id;
    if (!sent.ok) sendError = sent.error ?? "Gagal mengirim ke WhatsApp.";
  }

  const { data: reply, error: replyError } = await supabase
    .from("messages")
    .insert({
      lead_id: leadId,
      wa_message_id: waMessageId,
      direction: "outbound",
      sender_type: "bot",
      content: replyText,
      send_error: sendError,
    })
    .select("*")
    .single();
  if (replyError) throw replyError;

  return {
    ran: true,
    engine: result.engine,
    engine_error: result.engine_error,
    extracted: {
      customer_name: patch.customer_name ?? null,
      domicile: patch.domicile ?? null,
      interested_unit: patch.interested_unit ?? null,
    },
    became_warm: becameWarm,
    assigned_agent: becameWarm ? (assignedAgent ? { id: assignedAgent.id, full_name: assignedAgent.full_name } : null) : undefined,
    lead: updatedLead,
    reply: reply as Message,
  };
}
