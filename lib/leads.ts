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
