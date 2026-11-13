import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorMessage, jsonError } from "@/lib/http";
import type { LeadWithPreview, Message } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/leads - daftar lead + pesan terakhir, urut aktivitas terbaru. */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("leads")
      .select("*, messages(content, direction, created_at)")
      .order("last_customer_message_at", { ascending: false })
      .order("created_at", { referencedTable: "messages", ascending: false })
      .limit(1, { referencedTable: "messages" })
      .limit(500);
    if (error) throw error;

    const leads: LeadWithPreview[] = (data ?? []).map((row) => {
      const { messages, ...lead } = row as LeadWithPreview & {
        messages?: Pick<Message, "content" | "direction" | "created_at">[];
      };
      return { ...lead, last_message: messages?.[0] ?? null };
    });

    const activity = (l: LeadWithPreview) =>
      Math.max(
        new Date(l.last_customer_message_at).getTime(),
        l.last_message ? new Date(l.last_message.created_at).getTime() : 0,
      );
    leads.sort((a, b) => activity(b) - activity(a));

    return NextResponse.json({ ok: true, leads });
  } catch (err) {
    console.error("[leads]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}
