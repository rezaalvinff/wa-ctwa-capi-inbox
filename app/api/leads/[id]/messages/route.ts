import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorMessage, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/leads/:id/messages - detail lead + seluruh pesan (urut lama -> baru). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = getSupabaseAdmin();

    const [{ data: lead, error: leadError }, { data: messages, error: msgError }] = await Promise.all([
      supabase.from("leads").select("*").eq("id", id).maybeSingle(),
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

    return NextResponse.json({ ok: true, lead, messages: messages ?? [] });
  } catch (err) {
    console.error("[leads/:id/messages]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}
