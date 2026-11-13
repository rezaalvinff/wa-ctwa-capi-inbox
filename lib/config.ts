/** Konfigurasi bersama (server-side). */

export const CAPI_WINDOW_DAYS = 7;

/** Harus sama dengan jadwal di vercel.json (UTC). 02:00 UTC = 09:00 WIB. */
export const CRON_SCHEDULE = "0 2 * * *";
export const CRON_LABEL = "Setiap hari pukul 09:00 WIB (Vercel Cron)";

export function isMockMode(): boolean {
  return process.env.MOCK_MODE === "true";
}

export function hasGemini(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function hasCapiConfig(): boolean {
  return Boolean(process.env.META_DATASET_ID?.trim() && process.env.META_ACCESS_TOKEN?.trim());
}
