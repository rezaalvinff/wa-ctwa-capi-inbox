import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorMessage, jsonError } from "@/lib/http";
import { getRequestUser } from "@/lib/auth/users";
import { ASSIGNED_AGENT_EMBED, canAccessLead } from "@/lib/auth/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/leads/:id/messages - detail lead + seluruh pesan (urut lama -> baru). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = getRequestUser(req);
  try {
    const supabase = getSupabaseAdmin();

    const [{ data: lead, error: leadError }, { data: messages, error: msgError }] = await Promise.all([
      supabase.from("leads").select(`*, ${ASSIGNED_AGENT_EMBED}`).eq("id", id).maybeSingle(),
      supabase
        .from("messages")
        .select("*")
        .eq("lead_id", id)
        .order("created_at", { ascending: true })
        .limit(1000),
    ]);
    if (leadError) throw leadError;
    if (msgError) throw msgError;
    if (!lead) return jsonError("Lead tidak ditemukan.", 404);
    if (!canAccessLead(me, lead)) return jsonError("Lead ini tidak dioper ke Anda.", 403);

    return NextResponse.json({ ok: true, lead, messages: messages ?? [] });
  } catch (err) {
    console.error("[leads/:id/messages]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}
