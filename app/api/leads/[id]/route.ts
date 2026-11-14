import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorMessage, jsonError } from "@/lib/http";
import { computeStatus } from "@/lib/leads";
import { getRequestUser } from "@/lib/auth/users";
import { ASSIGNED_AGENT_EMBED, canAccessLead } from "@/lib/auth/access";
import { autoAssignLead } from "@/lib/routing";
import { addSystemNote, noteAutoAssigned, noteManualAssigned, noteNoAgentMatch, noteReturnedToAdmin } from "@/lib/notes";
import { sendLeadEventRealtime, type RealtimeCapiResult } from "@/lib/capi";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
  customer_name?: string | null;
  domicile?: string | null;
  interested_unit?: string | null;
  bot_active?: boolean;
  /** Admin saja: oper manual ke agent (uuid) atau kembalikan ke Admin (null). */
  assigned_agent_id?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanText(value: unknown, max = 120): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
}

/**
 * PATCH /api/leads/:id
 * - Edit manual data kualifikasi (nama/domisili/unit) dan/atau toggle bot_active.
 * - Admin: oper manual ke agent lewat assigned_agent_id (null = Antrian Admin).
 * Status cold/warm dihitung ulang otomatis. Jika lead menjadi warm karena edit
 * manual, bot dimatikan (handoff) kecuali bot_active dikirim eksplisit, lalu lead
 * dioper otomatis ke agent yang wilayahnya cocok dengan domisili.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = getRequestUser(req);
  if (!me) return jsonError("Belum login.", 401);

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return jsonError("Body harus berupa JSON.");
  }

  const patch: Partial<Lead> = {};
  if ("customer_name" in body) patch.customer_name = cleanText(body.customer_name);
  if ("domicile" in body) patch.domicile = cleanText(body.domicile);
  if ("interested_unit" in body) patch.interested_unit = cleanText(body.interested_unit);
  if ("bot_active" in body) {
    if (typeof body.bot_active !== "boolean") return jsonError("bot_active harus boolean.");
    patch.bot_active = body.bot_active;
  }
  const manualAssign = "assigned_agent_id" in body;
  if (manualAssign) {
    if (me.role !== "admin") return jsonError("Hanya Admin yang bisa mengoper lead ke agent.", 403);
    if (body.assigned_agent_id !== null && (typeof body.assigned_agent_id !== "string" || !UUID_RE.test(body.assigned_agent_id))) {
      return jsonError("assigned_agent_id tidak valid.");
    }
  }
  if (Object.keys(patch).length === 0 && !manualAssign) return jsonError("Tidak ada field yang diubah.");

  try {
    const supabase = getSupabaseAdmin();
    const { data: current, error: currentError } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
    if (currentError) throw currentError;
    if (!current) return jsonError("Lead tidak ditemukan.", 404);
    const lead = current as Lead;
    if (!canAccessLead(me, lead)) return jsonError("Lead ini tidak dioper ke Anda.", 403);

    let manualAgentName: string | null = null;
    if (manualAssign && body.assigned_agent_id) {
      const { data: agent, error: agentError } = await supabase
        .from("app_users")
        .select("id, role, is_active, full_name")
        .eq("id", body.assigned_agent_id)
        .maybeSingle();
      if (agentError) throw agentError;
      if (!agent || agent.role !== "agent" || !agent.is_active) return jsonError("Agent tidak ditemukan atau nonaktif.");
      patch.assigned_agent_id = agent.id;
      patch.assigned_at = new Date().toISOString();
      manualAgentName = agent.full_name as string;
    } else if (manualAssign) {
      patch.assigned_agent_id = null;
      patch.assigned_at = null;
    }

    const merged = { ...lead, ...patch };
    const status = computeStatus(merged);
    const becameWarm = lead.status !== "warm" && status === "warm";

    const { data: updated, error: updateError } = await supabase
      .from("leads")
      .update({
        ...patch,
        status,
        ...(becameWarm ? { warm_at: new Date().toISOString() } : {}),
        ...(becameWarm && !("bot_active" in body) ? { bot_active: false } : {}),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    // Auto-routing: lead WARM tanpa agent (baru warm, atau domisili dikoreksi) -> agent sesuai wilayah.
    let autoAssigned: { id: string; full_name: string } | null = null;
    const domicileChanged = "domicile" in body && patch.domicile !== lead.domicile;
    if (!manualAssign && (becameWarm || domicileChanged)) {
      const result = await autoAssignLead(updated as Lead);
      if (result) {
        autoAssigned = { id: result.agent.id, full_name: result.agent.full_name };
        await addSystemNote(id, noteAutoAssigned(result.agent.full_name, (updated as Lead).domicile ?? "", result.region));
      } else if (becameWarm && !(updated as Lead).assigned_agent_id) {
        await addSystemNote(id, noteNoAgentMatch((updated as Lead).domicile ?? ""));
      }
    }

    // Catatan oper manual oleh Admin.
    if (manualAssign && (patch.assigned_agent_id ?? null) !== (lead.assigned_agent_id ?? null)) {
      await addSystemNote(id, manualAgentName ? noteManualAssigned(me.full_name, manualAgentName) : noteReturnedToAdmin(me.full_name));
    }

    // Lead baru WARM -> kirim event LeadSubmitted ke Meta CAPI secara real-time.
    let capi: RealtimeCapiResult | undefined;
    if (becameWarm) capi = await sendLeadEventRealtime(id);

    const { data: fresh, error: freshError } = await supabase
      .from("leads")
      .select(`*, ${ASSIGNED_AGENT_EMBED}`)
      .eq("id", id)
      .single();
    if (freshError) throw freshError;

    return NextResponse.json({ ok: true, lead: fresh, became_warm: becameWarm, auto_assigned: autoAssigned, capi });
  } catch (err) {
    console.error("[leads/:id PATCH]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}
