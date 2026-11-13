import { NextResponse } from "next/server";
import { syncWarmLeads } from "@/lib/capi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/capi/sync-warm
 * Kirim event 'Lead' ke Meta CAPI untuk semua prospek:
 * status warm + source meta_ads + ctwa_clid terisi + aktif 7 hari terakhir + belum pernah terkirim.
 */
export async function POST() {
  const summary = await syncWarmLeads("manual");
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}
