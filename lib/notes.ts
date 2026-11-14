import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Catatan sistem di timeline roomchat (sender_type 'system').
 * Hanya terlihat di dashboard, tidak dikirim ke WhatsApp pelanggan, dan
 * tidak dihitung sebagai aktivitas untuk auto-close 24 jam.
 * Tidak melempar error: kegagalan mencatat tidak boleh menggagalkan alur utama.
 */
export async function addSystemNote(leadId: string, content: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("messages").insert({
    lead_id: leadId,
    direction: "outbound",
    sender_type: "system",
    content,
  });
  if (error) console.error("[notes] gagal menyimpan catatan sistem:", error.message);
}

export function noteAutoAssigned(agentName: string, domicile: string, region: string): string {
  return `📌 Lead dioper otomatis ke ${agentName} — domisili "${domicile}" cocok dengan wilayah "${region}".`;
}

export function noteNoAgentMatch(domicile: string): string {
  return `📌 Tidak ada wilayah agent yang cocok dengan domisili "${domicile}" — lead masuk Antrian Admin untuk dibalas manual.`;
}

export function noteManualAssigned(adminName: string, agentName: string): string {
  return `📌 ${adminName || "Admin"} mengoper lead ke ${agentName}.`;
}

export function noteReturnedToAdmin(adminName: string): string {
  return `📌 ${adminName || "Admin"} mengembalikan lead ke Antrian Admin.`;
}

export function noteAdminHandles(domicile: string): string {
  return `📌 Lead WARM (domisili "${domicile}") — ditangani Admin untuk dibalas manual.`;
}

export function noteBotLimit(max: number): string {
  return `📌 Bot berhenti setelah ${max} balasan karena data belum lengkap — percakapan dilanjutkan Admin secara manual.`;
}
