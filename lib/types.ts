export type LeadSource = "meta_ads" | "organic";
export type LeadStatus = "cold" | "warm";
export type MessageDirection = "inbound" | "outbound";
/** system = catatan internal di roomchat (tidak dikirim ke WhatsApp). */
export type SenderType = "customer" | "bot" | "cs" | "system";

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
  /** Pesan terakhir dari siapa pun (customer/bot/admin/agent). Dasar auto-close 24 jam. */
  last_activity_at: string;
  assigned_agent_id: string | null;
  assigned_at: string | null;
  /** Diisi API (join ke app_users) bila lead sudah dioper ke agent. */
  assigned_agent?: { id: string; full_name: string } | null;
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
  sent_by?: string | null;
  sent_by_name?: string | null;
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

export type UserRole = "admin" | "agent";

export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  /** Wilayah yang dipegang agent, dipakai untuk auto-routing lead WARM. */
  regions: string[];
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeItem {
  id: string;
  title: string;
  source_type: "file" | "manual";
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  content: string;
  is_active: boolean;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}
