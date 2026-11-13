import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";
import { errorMessage } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------
// Tipe minimal payload WhatsApp Cloud API
// ---------------------------------------------------------------------
interface WaReferral {
  source_url?: string;
  source_id?: string;
  source_type?: string;
  headline?: string;
  body?: string;
  ctwa_clid?: string;
}

interface WaMessage {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string; filename?: string };
  audio?: Record<string, unknown>;
  sticker?: Record<string, unknown>;
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: Array<{ name?: { formatted_name?: string } }>;
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  reaction?: { emoji?: string; message_id?: string };
  referral?: WaReferral;
}

interface WaContact {
  wa_id?: string;
  profile?: { name?: string };
}

interface WaChangeValue {
  messaging_product?: string;
  contacts?: WaContact[];
  messages?: WaMessage[];
  statuses?: unknown[];
}

interface WaWebhookBody {
  object?: string;
  entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: WaChangeValue }> }>;
}

// ---------------------------------------------------------------------
// GET: verifikasi webhook Meta
// ---------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    process.env.WEBHOOK_VERIFY_TOKEN &&
    token === process.env.WEBHOOK_VERIFY_TOKEN
  ) {
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new NextResponse("Forbidden", {
    status: 403,
    headers: { "Content-Type": "text/plain" },
  });
}

// ---------------------------------------------------------------------
// POST: pesan masuk dari WhatsApp Cloud API
// ---------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Opsional: verifikasi signature X-Hub-Signature-256 bila META_APP_SECRET diisi.
  const appSecret = process.env.META_APP_SECRET;
  if (appSecret) {
    const signature = req.headers.get("x-hub-signature-256") ?? "";
    if (!isValidSignature(rawBody, signature, appSecret)) {
      console.warn("[webhook] Signature tidak valid, payload diabaikan.");
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }

  let body: WaWebhookBody;
  try {
    body = JSON.parse(rawBody) as WaWebhookBody;
  } catch {
    // Payload bukan JSON: tetap 200 agar Meta tidak retry terus-menerus.
    return NextResponse.json({ ok: true, ignored: "invalid_json" }, { status: 200 });
  }

  let processed = 0;
  try {
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        // Event status delivery/read (tanpa messages) -> abaikan.
        if (!value?.messages || value.messages.length === 0) continue;

        for (const message of value.messages) {
          const contact =
            value.contacts?.find((c) => c.wa_id === message.from) ?? value.contacts?.[0];
          await handleInboundMessage(message, contact);
          processed += 1;
        }
      }
    }
  } catch (err) {
    // Tetap balas 200 agar Meta tidak membanjiri retry; error dicatat di log Vercel.
    console.error("[webhook] Gagal memproses pesan:", errorMessage(err));
  }

  return NextResponse.json({ ok: true, processed }, { status: 200 });
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function isValidSignature(rawBody: string, header: string, secret: string): boolean {
  if (!header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const received = header.slice("sha256=".length);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function extractContent(m: WaMessage): string {
  switch (m.type) {
    case "text":
      return m.text?.body ?? "";
    case "image":
      return m.image?.caption ? `[Gambar] ${m.image.caption}` : "[Gambar]";
    case "video":
      return m.video?.caption ? `[Video] ${m.video.caption}` : "[Video]";
    case "document":
      return `[Dokumen] ${m.document?.caption ?? m.document?.filename ?? ""}`.trim();
    case "audio":
      return "[Pesan suara]";
    case "sticker":
      return "[Stiker]";
    case "location": {
      const loc = m.location;
      const label = [loc?.name, loc?.address].filter(Boolean).join(" - ");
      return `[Lokasi] ${label || `${loc?.latitude ?? ""},${loc?.longitude ?? ""}`}`.trim();
    }
    case "contacts":
      return `[Kontak] ${m.contacts?.map((c) => c.name?.formatted_name).filter(Boolean).join(", ") ?? ""}`.trim();
    case "button":
      return m.button?.text ?? "[Tombol]";
    case "interactive":
      return (
        m.interactive?.button_reply?.title ??
        m.interactive?.list_reply?.title ??
        "[Interaktif]"
      );
    case "reaction":
      return `[Reaksi] ${m.reaction?.emoji ?? ""}`.trim();
    default:
      return m.text?.body ?? `[${m.type || "pesan"}]`;
  }
}

function messageTimestampIso(m: WaMessage): string {
  const ts = Number(m.timestamp);
  if (Number.isFinite(ts) && ts > 0) return new Date(ts * 1000).toISOString();
  return new Date().toISOString();
}

async function handleInboundMessage(message: WaMessage, contact?: WaContact) {
  const supabase = getSupabaseAdmin();

  const phone = normalizePhone(message.from);
  const customerName = contact?.profile?.name ?? null;
  const content = extractContent(message);
  const messageAt = messageTimestampIso(message);
  const referral = message.referral;
  const ctwaClid = referral?.ctwa_clid?.trim();

  let leadId: string;

  if (ctwaClid) {
    // Chat dari iklan CTWA -> simpan/perbarui atribusi iklan.
    const { data, error } = await supabase
      .from("leads")
      .upsert(
        {
          phone_number: phone,
          ...(customerName ? { customer_name: customerName } : {}),
          source: "meta_ads",
          ctwa_clid: ctwaClid,
          ad_id: referral?.source_id ?? null,
          ad_headline: referral?.headline ?? null,
          last_customer_message_at: messageAt,
        },
        { onConflict: "phone_number" },
      )
      .select("id")
      .single();
    if (error) throw error;
    leadId = data.id as string;
  } else {
    // Chat tanpa referral: lead baru -> organic. Lead lama -> atribusi
    // (source, ctwa_clid, ad_id, ad_headline) TIDAK ditimpa.
    const { error: insertError } = await supabase.from("leads").upsert(
      {
        phone_number: phone,
        customer_name: customerName,
        source: "organic",
        last_customer_message_at: messageAt,
      },
      { onConflict: "phone_number", ignoreDuplicates: true },
    );
    if (insertError) throw insertError;

    const { data, error } = await supabase
      .from("leads")
      .update({
        ...(customerName ? { customer_name: customerName } : {}),
        last_customer_message_at: messageAt,
      })
      .eq("phone_number", phone)
      .select("id")
      .single();
    if (error) throw error;
    leadId = data.id as string;
  }

  // Simpan pesan; abaikan duplikat (webhook retry) berdasarkan wa_message_id.
  const { error: msgError } = await supabase.from("messages").upsert(
    {
      lead_id: leadId,
      wa_message_id: message.id,
      direction: "inbound",
      content,
      created_at: messageAt,
    },
    { onConflict: "wa_message_id", ignoreDuplicates: true },
  );
  if (msgError) throw msgError;
}
