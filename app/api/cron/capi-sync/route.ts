import { NextRequest, NextResponse } from "next/server";
import { syncWarmLeads } from "@/lib/capi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/capi-sync - dipanggil Vercel Cron (lihat vercel.json).
 * Jika CRON_SECRET diisi, Vercel otomatis mengirim header
 * "Authorization: Bearer <CRON_SECRET>" dan request lain ditolak.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const summary = await syncWarmLeads("cron");
  console.log(
    `[cron/capi-sync] eligible=${summary.total_eligible} sent=${summary.total_sent} failed=${summary.total_failed}${
      summary.error ? ` error=${summary.error}` : ""
    }`,
  );
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}
