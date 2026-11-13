import type { Lead } from "@/lib/types";
import type { RequestUser } from "@/lib/auth/users";

/** Admin: semua lead. Agent: hanya lead yang dioper ke dia. */
export function canAccessLead(user: RequestUser | null, lead: Pick<Lead, "assigned_agent_id">): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return lead.assigned_agent_id === user.id;
}

/** Join nama agent untuk select lead (PostgREST embed via FK). */
export const ASSIGNED_AGENT_EMBED = "assigned_agent:app_users!leads_assigned_agent_id_fkey(id, full_name)";
