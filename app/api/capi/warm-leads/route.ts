import { NextResponse } from "next/server";
import { fetchWarmCtwaLeads } from "@/lib/capi";
import { errorMessage, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/capi/warm-leads - prospek warm CTWA Meta Ads 7 hari terakhir + statistik. */
export async function GET() {
  try {
    const leads = await fetchWarmCtwaLeads();
    const sent = leads.filter((l) => l.capi_state === "sent").length;
    return NextResponse.json({
      ok: true,
      stats: { total: leads.length, pending: leads.length - sent, sent },
      leads,
    });
  } catch (err) {
    console.error("[capi/warm-leads]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}
