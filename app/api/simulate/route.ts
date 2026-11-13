import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomInt } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorMessage, jsonError } from "@/lib/http";
import { runBotForInbound } from "@/lib/bot-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROFILE_NAMES = ["Budi S", "Siti", "Andi Pratama", "Dewi", "Rizky", "Putri", "Agus", "Rina K", "Fajar", "Maya", "Joko W", "Lestari"];

const CTWA_OPENERS = [
  "Halo kak, saya lihat iklannya. Promo ini masih berlaku?",
  "Hai, mau tanya detail promo spesial bulan ini dong.",
  "Selamat siang, mau info harga dan promonya kak.",
];
const ORGANIC_OPENERS = [
  "Halo, saya dapat nomor ini dari teman. Mau tanya-tanya mobil Mitsubishi.",
  "Permisi kak, dealer buka sampai jam berapa ya?",
  "Kak, bisa kirim brosur dan pricelist?",
];

function pick<T>(arr: T[]): T {
  return arr[randomInt(arr.length)];
}

/**
 * POST /api/simulate
 * Body opsional: { "type": "ctwa" | "organic" } (default "ctwa")
 * Membuat lead dummy + 1 pesan inbound, lalu chatbot langsung membalas.
 */
export async function POST(req: NextRequest) {
  let type: "ctwa" | "organic" = "ctwa";
  try {
    const body = (await req.json()) as { type?: string };
    if (body?.type === "organic") type = "organic";
  } catch {
    // body kosong -> default ctwa
  }

  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const isCtwa = type === "ctwa";

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        phone_number: `62812${String(randomInt(0, 100_000_000)).padStart(8, "0")}`,
        customer_name: null,
        wa_profile_name: `${pick(PROFILE_NAMES)} (Dummy)`,
        source: isCtwa ? "meta_ads" : "organic",
        ctwa_clid: isCtwa ? `ARAk${randomBytes(48).toString("base64url")}` : null,
        ad_id: isCtwa ? `1202${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}` : null,
        ad_headline: isCtwa ? "Promo Spesial Bulan Ini" : null,
        is_simulated: true,
        last_customer_message_at: now,
      })
      .select("*")
      .single();
    if (leadError) throw leadError;

    const { data: message, error: msgError } = await supabase
      .from("messages")
      .insert({
        lead_id: lead.id,
        wa_message_id: `wamid.SIMULATED_${randomBytes(12).toString("hex")}`,
        direction: "inbound",
        sender_type: "customer",
        content: pick(isCtwa ? CTWA_OPENERS : ORGANIC_OPENERS),
        created_at: now,
      })
      .select("*")
      .single();
    if (msgError) throw msgError;

    const bot = await runBotForInbound(lead.id, message.id);

    return NextResponse.json({ ok: true, lead: bot.lead ?? lead, message, bot });
  } catch (err) {
    console.error("[simulate]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}
