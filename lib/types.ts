export type LeadSource = "meta_ads" | "organic";
export type LeadStatus = "cold" | "warm";
export type MessageDirection = "inbound" | "outbound";
export type SenderType = "customer" | "bot" | "cs";

export const LEAD_STATUSES: LeadStatus[] = ["cold", "warm"];

export interface Lead {
  id: string;
  phone_number: string;
  customer_name: string | null;
  wa_profile_name: string | null;
  domicile: string | null;
  interested_unit: string | null;
  source: LeadSource;
  ctwa_clid: string | null;
  ad_id: string | null;
  ad_headline: string | null;
  status: LeadStatus;
  warm_at: string | null;
  bot_active: boolean;
  is_simulated: boolean;
  deal_value: number | string;
  capi_sent_events: string[];
  capi_synced_at: string | null;
  last_capi_response: Record<string, unknown> | null;
  last_customer_message_at: string;
  created_at: string;
}

export interface Message {
  id: string;
  lead_id: string;
  wa_message_id: string | null;
  direction: MessageDirection;
  sender_type: SenderType;
  content: string;
  send_error: string | null;
  created_at: string;
}

export type MessagePreview = Pick<Message, "content" | "direction" | "sender_type" | "created_at">;

export interface LeadWithPreview extends Lead {
  last_message: MessagePreview | null;
}

export interface AppConfig {
  mock_mode: boolean;
  ai_engine: "gemini" | "rules";
  capi_configured: boolean;
  test_event_code: boolean;
  cron_schedule: string;
  cron_label: string;
  capi_window_days: number;
}

export interface CapiSyncLeadLog {
  lead_id: string;
  phone_number: string;
  customer_name: string | null;
  success: boolean;
  http_status: number | null;
  error?: string;
  response?: unknown;
}

export interface CapiSyncSummary {
  ok: boolean;
  trigger: "manual" | "cron";
  started_at: string;
  finished_at: string;
  total_eligible: number;
  total_sent: number;
  total_failed: number;
  results: CapiSyncLeadLog[];
  error?: string;
}

export interface WarmCapiLead extends Lead {
  capi_state: "pending" | "sent";
}
