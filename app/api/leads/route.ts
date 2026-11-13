import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorMessage, jsonError } from "@/lib/http";
import { getRequestUser } from "@/lib/auth/users";
import { ASSIGNED_AGENT_EMBED } from "@/lib/auth/access";
import type { LeadWithPreview, MessagePreview } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/leads - daftar lead + pesan terakhir, urut aktivitas terbaru.
 * Admin melihat semua lead; Agent hanya lead yang dioper ke dirinya.
 */
export async function GET(req: NextRequest) {
  const me = getRequestUser(req);
  if (!me) return jsonError("Belum login.", 401);
  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("leads")
      .select(`*, ${ASSIGNED_AGENT_EMBED}, messages(content, direction, sender_type, created_at)`)
      .order("last_activity_at", { ascending: false })
      .order("created_at", { referencedTable: "messages", ascending: false })
      .limit(1, { referencedTable: "messages" })
      .limit(500);
    if (me.role === "agent") query = query.eq("assigned_agent_id", me.id);
    const { data, error } = await query;
    if (error) throw error;

    const leads: LeadWithPreview[] = (data ?? []).map((row) => {
      const { messages, ...lead } = row as LeadWithPreview & { messages?: MessagePreview[] };
      return { ...lead, last_message: messages?.[0] ?? null };
    });

    const activity = (l: LeadWithPreview) =>
      Math.max(
        new Date(l.last_activity_at ?? l.last_customer_message_at).getTime(),
        l.last_message ? new Date(l.last_message.created_at).getTime() : 0,
      );
    leads.sort((a, b) => activity(b) - activity(a));

    return NextResponse.json({ ok: true, leads });
  } catch (err) {
    console.error("[leads]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}
