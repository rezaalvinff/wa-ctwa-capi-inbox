import type { Lead, LeadStatus } from "@/lib/types";

type QualificationFields = Pick<Lead, "customer_name" | "domicile" | "interested_unit">;

export function isFilled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** warm jika nama + domisili + unit ketiganya terisi, selain itu cold. */
export function computeStatus(fields: QualificationFields): LeadStatus {
  return isFilled(fields.customer_name) && isFilled(fields.domicile) && isFilled(fields.interested_unit)
    ? "warm"
    : "cold";
}

export type QualificationKey = "customer_name" | "domicile" | "interested_unit";

export const QUALIFICATION_ORDER: QualificationKey[] = ["customer_name", "domicile", "interested_unit"];

export function missingFields(fields: QualificationFields): QualificationKey[] {
  return QUALIFICATION_ORDER.filter((k) => !isFilled(fields[k]));
}

/** Nama untuk ditampilkan: nama terkonfirmasi > nama profil WA > nomor. */
export function displayName(lead: Pick<Lead, "customer_name" | "wa_profile_name" | "phone_number">): string {
  return lead.customer_name?.trim() || lead.wa_profile_name?.trim() || `+${lead.phone_number}`;
}

// ---------------------------------------------------------------------
// Auto-close room chat
// ---------------------------------------------------------------------
/** Room chat otomatis CLOSED bila tidak ada pesan dari siapa pun selama ini. */
export const CHAT_CLOSE_HOURS = 24;
const CHAT_CLOSE_MS = CHAT_CLOSE_HOURS * 60 * 60 * 1000;

type ActivityFields = Pick<Lead, "last_activity_at" | "last_customer_message_at" | "created_at">;

function activityMs(lead: ActivityFields): number {
  const t = new Date(lead.last_activity_at ?? lead.last_customer_message_at ?? lead.created_at).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

/** Waktu room tertutup (atau akan tertutup) otomatis. */
export function chatClosesAt(lead: ActivityFields): Date {
  return new Date(activityMs(lead) + CHAT_CLOSE_MS);
}

export function isChatClosed(lead: ActivityFields, now = Date.now()): boolean {
  return now - activityMs(lead) >= CHAT_CLOSE_MS;
}
