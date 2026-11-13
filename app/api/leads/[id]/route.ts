import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorMessage, jsonError } from "@/lib/http";
import { computeStatus } from "@/lib/leads";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
  customer_name?: string | null;
  domicile?: string | null;
  interested_unit?: string | null;
  bot_active?: boolean;
}

function cleanText(value: unknown, max = 120): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
}

/**
 * PATCH /api/leads/:id
 * Edit manual data kualifikasi (nama/domisili/unit) dan/atau toggle bot_active.
 * Status cold/warm dihitung ulang otomatis. Jika lead menjadi warm karena edit
 * manual, bot otomatis dimatikan (handoff) kecuali bot_active dikirim eksplisit.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  if (Object.keys(patch).length === 0) return jsonError("Tidak ada field yang diubah.");

  try {
    const supabase = getSupabaseAdmin();
    const { data: current, error: currentError } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
    if (currentError) throw currentError;
    if (!current) return jsonError("Lead tidak ditemukan.", 404);

    const lead = current as Lead;
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

    return NextResponse.json({ ok: true, lead: updated, became_warm: becameWarm });
  } catch (err) {
    console.error("[leads/:id PATCH]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}
