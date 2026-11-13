import { NextResponse } from "next/server";
import { CAPI_WINDOW_DAYS, CRON_LABEL, CRON_SCHEDULE, hasCapiConfig, hasGemini, isMockMode } from "@/lib/config";
import type { AppConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/config - flag konfigurasi non-rahasia untuk UI. */
export async function GET() {
  const config: AppConfig = {
    mock_mode: isMockMode(),
    ai_engine: hasGemini() ? "gemini" : "rules",
    capi_configured: hasCapiConfig(),
    test_event_code: Boolean(process.env.META_TEST_EVENT_CODE?.trim()),
    cron_schedule: CRON_SCHEDULE,
    cron_label: CRON_LABEL,
    capi_window_days: CAPI_WINDOW_DAYS,
  };
  return NextResponse.json({ ok: true, config });
}
