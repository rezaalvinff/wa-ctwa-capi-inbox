import type { AppUser, UserRole } from "@/lib/types";

/**
 * Header yang di-set oleh middleware setelah sesi divalidasi ke database.
 * Middleware selalu menimpa/menghapus header ini dari request klien,
 * jadi nilainya bisa dipercaya di API routes.
 */
export const USER_HEADERS = {
  id: "x-dipo-user-id",
  role: "x-dipo-user-role",
  name: "x-dipo-user-name",
  email: "x-dipo-user-email",
} as const;

export const PUBLIC_USER_COLUMNS = "id, email, full_name, role, regions, is_active, last_login_at, created_at, updated_at";

export type RequestUser = Pick<AppUser, "id" | "role" | "full_name" | "email">;

export function getRequestUser(req: Request): RequestUser | null {
  const id = req.headers.get(USER_HEADERS.id);
  const role = req.headers.get(USER_HEADERS.role) as UserRole | null;
  if (!id || (role !== "admin" && role !== "agent")) return null;
  return {
    id,
    role,
    full_name: decodeURIComponent(req.headers.get(USER_HEADERS.name) ?? ""),
    email: req.headers.get(USER_HEADERS.email) ?? "",
  };
}

export function normalizeEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;
}

/** Validasi daftar wilayah agent: trim, buang duplikat (tanpa beda huruf besar/kecil). */
export function cleanRegions(value: unknown): string[] | { error: string } {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n;]/) : null;
  if (!raw) return { error: "regions harus berupa daftar wilayah." };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const region = String(item ?? "").replace(/\s+/g, " ").trim();
    if (!region) continue;
    if (region.length > 60) return { error: `Nama wilayah terlalu panjang: "${region.slice(0, 20)}..."` };
    const key = region.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(region);
  }
  if (out.length > 100) return { error: "Maksimal 100 wilayah per agent." };
  return out;
}
