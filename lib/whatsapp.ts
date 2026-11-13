import { GRAPH_API_VERSION } from "@/lib/http";

export interface WaSendResult {
  ok: boolean;
  wa_message_id: string | null;
  status: number;
  error?: string;
  raw?: unknown;
}

interface WaSendResponse {
  messages?: Array<{ id: string }>;
  error?: { message?: string; code?: number; error_subcode?: number; type?: string };
}

/** Kirim pesan teks via WhatsApp Cloud API. Tidak melempar error. */
export async function sendWhatsAppText(to: string, body: string): Promise<WaSendResult> {
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  const accessToken = process.env.WA_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    return {
      ok: false,
      wa_message_id: null,
      status: 500,
      error: "WA_PHONE_NUMBER_ID dan WA_ACCESS_TOKEN wajib diisi (atau set MOCK_MODE=true).",
    };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: body.slice(0, 4096) },
      }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as WaSendResponse;
    if (!res.ok) {
      return {
        ok: false,
        wa_message_id: null,
        status: res.status,
        error: json.error?.message ?? `WhatsApp API error (HTTP ${res.status})`,
        raw: json.error ?? json,
      };
    }
    return { ok: true, wa_message_id: json.messages?.[0]?.id ?? null, status: res.status };
  } catch (err) {
    return {
      ok: false,
      wa_message_id: null,
      status: 502,
      error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
