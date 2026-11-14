/**
 * Auto-routing lead WARM ke agent berdasarkan wilayah (domisili).
 * Jika tidak ada wilayah agent yang cocok, lead tetap di Antrian Admin.
 */
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Lead } from "@/lib/types";

export interface AgentCandidate {
  id: string;
  full_name: string;
  regions: string[];
}

/** "Kota Jakarta Selatan" -> "jakarta selatan", "Kab. Bandung" -> "bandung" */
export function normalizeRegion(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(kota|kabupaten|kab|kec|kecamatan|provinsi|prov|daerah|wilayah|area)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Skor kecocokan domisili dengan satu wilayah agent.
 * - sama persis            -> 1000 + panjang wilayah
 * - wilayah ada di domisili sebagai kata utuh (mis. wilayah "Jakarta",
 *   domisili "Jakarta Selatan")  -> panjang wilayah
 * - selain itu             -> 0
 */
export function regionMatchScore(domicile: string, region: string): number {
  const d = normalizeRegion(domicile);
  const r = normalizeRegion(region);
  if (!d || !r) return 0;
  if (d === r) return 1000 + r.length;
  return ` ${d} `.includes(` ${r} `) ? r.length : 0;
}

/** Wilayah agent yang paling cocok dengan domisili (null bila tidak ada). */
export function bestMatchingRegion(domicile: string, regions: string[]): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const r of regions ?? []) {
    const score = regionMatchScore(domicile, r);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/** Agent dengan wilayah paling spesifik yang cocok (kosong bila tidak ada). */
export function pickAgentsForDomicile(domicile: string, agents: AgentCandidate[]): AgentCandidate[] {
  let best = 0;
  let winners: AgentCandidate[] = [];
  for (const agent of agents) {
    const score = Math.max(0, ...(agent.regions ?? []).map((r) => regionMatchScore(domicile, r)));
    if (score === 0) continue;
    if (score > best) {
      best = score;
      winners = [agent];
    } else if (score === best) {
      winners.push(agent);
    }
  }
  return winners;
}

export interface AutoAssignResult {
  agent: AgentCandidate;
  /** Wilayah agent yang cocok dengan domisili. */
  region: string;
}

/**
 * Tugaskan lead WARM yang belum punya agent ke agent yang wilayahnya cocok.
 * Bila beberapa agent sama cocoknya, dipilih yang paling sedikit memegang lead
 * dalam 7 hari terakhir. Mengembalikan agent + wilayah yang cocok, atau null.
 */
export async function autoAssignLead(lead: Pick<Lead, "id" | "status" | "domicile" | "assigned_agent_id">): Promise<AutoAssignResult | null> {
  if (lead.status !== "warm" || lead.assigned_agent_id || !lead.domicile?.trim()) return null;
  const supabase = getSupabaseAdmin();

  const { data: agents, error } = await supabase
    .from("app_users")
    .select("id, full_name, regions")
    .eq("role", "agent")
    .eq("is_active", true);
  if (error) throw error;

  const candidates = pickAgentsForDomicile(lead.domicile, (agents ?? []) as AgentCandidate[]);
  if (candidates.length === 0) return null;

  let chosen = candidates[0];
  if (candidates.length > 1) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const loads = await Promise.all(
      candidates.map(async (agent) => {
        const { count } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("assigned_agent_id", agent.id)
          .gte("assigned_at", since);
        return { agent, load: count ?? 0 };
      }),
    );
    loads.sort((a, b) => a.load - b.load);
    chosen = loads[0].agent;
  }

  // Hanya tugaskan bila masih belum ada agent (hindari menimpa penugasan paralel).
  const { data: updated, error: updateError } = await supabase
    .from("leads")
    .update({ assigned_agent_id: chosen.id, assigned_at: new Date().toISOString() })
    .eq("id", lead.id)
    .is("assigned_agent_id", null)
    .select("id");
  if (updateError) throw updateError;
  if (!updated || updated.length === 0) return null;
  return { agent: chosen, region: bestMatchingRegion(lead.domicile, chosen.regions) ?? lead.domicile };
}

/** Jumlah agent aktif. 0 = belum memakai agent, semua lead ditangani Admin. */
export async function countActiveAgents(): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("app_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "agent")
    .eq("is_active", true);
  if (error) throw error;
  return count ?? 0;
}
