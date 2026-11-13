export type LeadSource = "meta_ads" | "organic";
export type LeadStatus = "new" | "qualified" | "closing" | "junk";
export type MessageDirection = "inbound" | "outbound";
export type CapiEventName = "Lead" | "Purchase";

export const LEAD_STATUSES: LeadStatus[] = ["new", "qualified", "closing", "junk"];

export interface Lead {
  id: string;
  phone_number: string;
  customer_name: string | null;
  source: LeadSource;
  ctwa_clid: string | null;
  ad_id: string | null;
  ad_headline: string | null;
  status: LeadStatus;
  deal_value: number | string;
  capi_sent_events: string[];
  last_capi_response: Record<string, unknown> | null;
  last_customer_message_at: string;
  created_at: string;
}

export interface Message {
  id: string;
  lead_id: string;
  wa_message_id: string | null;
  direction: MessageDirection;
  content: string;
  created_at: string;
}

export interface LeadWithPreview extends Lead {
  last_message: Pick<Message, "content" | "direction" | "created_at"> | null;
}
