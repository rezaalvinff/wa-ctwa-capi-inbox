import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomInt } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorMessage, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIRST_NAMES = ["Budi", "Siti", "Andi", "Dewi", "Rizky", "Putri", "Agus", "Rina", "Fajar", "Maya", "Joko", "Lestari"];
const LAST_NAMES = ["Santoso", "Wijaya", "Pratama", "Lestari", "Saputra", "Hidayat", "Kusuma", "Nugroho"];

const CTWA_OPENERS = [
  "Halo kak, saya lihat iklannya. Promo ini masih berlaku?",
  "Hai, mau tanya detail promo spesial bulan ini dong.",
  "Selamat siang, harga paketnya berapa ya kak?",
];
const ORGANIC_OPENERS = [
  "Halo, saya dapat nomor ini dari teman. Mau tanya produknya.",
  "Permisi kak, toko buka jam berapa ya?",
  "Kak, bisa kirim katalognya?",
];

function pick<T>(arr: T[]): T {
  return arr[randomInt(arr.length)];
}

function randomPhone(): string {
  // 62812 + 8 digit acak
  return `62812${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
}

function randomCtwaClid(): string {
  return `ARAk${randomBytes(48).toString("base64url")}`;
}

/**
 * POST /api/simulate
 * Body opsional: { "type": "ctwa" | "organic" } (default "ctwa")
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
        phone_number: randomPhone(),
        customer_name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} (Dummy)`,
        source: isCtwa ? "meta_ads" : "organic",
        ctwa_clid: isCtwa ? randomCtwaClid() : null,
        ad_id: isCtwa ? `1202${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}` : null,
        ad_headline: isCtwa ? "Promo Spesial Bulan Ini" : null,
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
        content: pick(isCtwa ? CTWA_OPENERS : ORGANIC_OPENERS),
        created_at: now,
      })
      .select("*")
      .single();
    if (msgError) throw msgError;

    return NextResponse.json({ ok: true, lead, message });
  } catch (err) {
    console.error("[simulate]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}
