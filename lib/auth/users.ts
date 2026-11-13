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

export const PUBLIC_USER_COLUMNS = "id, email, full_name, role, is_active, last_login_at, created_at, updated_at";

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
