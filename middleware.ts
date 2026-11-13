import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, getAuthSecret, verifySession } from "@/lib/auth/session";
import { USER_HEADERS } from "@/lib/auth/users";

/**
 * Penjaga autentikasi & otorisasi untuk seluruh halaman dan API.
 *
 * - Publik      : /login, /api/auth/login, /api/auth/logout,
 *                 /api/webhook (Meta), /api/cron/capi-sync (dilindungi CRON_SECRET).
 * - Admin saja  : /api/capi/*, /api/users/*, /api/simulate/*, /api/knowledge/*
 * - Admin+Agent : sisanya (inbox, kirim pesan, edit lead).
 *
 * Status aktif, role & session_version user dibaca dari database pada setiap
 * request, sehingga menonaktifkan user / mengubah role / reset password
 * langsung berlaku (sesi lama otomatis tidak valid).
 */

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/webhook", "/api/cron/capi-sync"];
const ADMIN_ONLY_PATHS = ["/api/capi", "/api/users", "/api/simulate", "/api/knowledge"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

interface DbUser {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "agent";
  is_active: boolean;
  session_version: number;
}

async function loadUser(uid: string): Promise<DbUser | null | "error"> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !UUID_RE.test(uid)) return url && key ? null : "error";
  try {
    const res = await fetch(
      `${url}/rest/v1/app_users?select=id,email,full_name,role,is_active,session_version&id=eq.${uid}&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
    );
    if (!res.ok) return "error";
    const rows = (await res.json()) as DbUser[];
    return rows[0] ?? null;
  } catch {
    return "error";
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // Jangan pernah percaya header identitas dari klien.
  const headers = new Headers(req.headers);
  for (const h of Object.values(USER_HEADERS)) headers.delete(h);

  const secret = getAuthSecret();
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  if (matches(pathname, PUBLIC_PATHS)) {
    // Sudah login lalu membuka /login -> langsung ke dashboard.
    if (pathname === "/login" && secret && (await verifySession(token, secret))) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next({ request: { headers } });
  }

  const deny = (status: 401 | 403 | 500 | 503, message: string, clearCookie = false) => {
    let res: NextResponse;
    if (isApi) {
      res = NextResponse.json({ ok: false, error: message }, { status });
    } else if (status === 503 || status === 500) {
      res = new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    } else {
      const loginUrl = new URL("/login", req.url);
      if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
      res = NextResponse.redirect(loginUrl);
    }
    if (clearCookie) res.cookies.delete(SESSION_COOKIE);
    return res;
  };

  if (!secret) {
    return isApi
      ? deny(500, "AUTH_SECRET belum diisi (minimal 32 karakter).")
      : NextResponse.redirect(new URL("/login", req.url));
  }

  const session = await verifySession(token, secret);
  if (!session) return deny(401, "Sesi berakhir. Silakan login kembali.", Boolean(token));

  const user = await loadUser(session.uid);
  if (user === "error") return deny(503, "Gagal memverifikasi sesi ke database. Coba lagi sebentar.");
  if (!user || !user.is_active || user.session_version !== session.ver) {
    return deny(401, "Sesi tidak berlaku lagi. Silakan login kembali.", true);
  }

  if (matches(pathname, ADMIN_ONLY_PATHS) && user.role !== "admin") {
    return deny(403, "Akses ditolak: fitur ini hanya untuk Admin.");
  }

  headers.set(USER_HEADERS.id, user.id);
  headers.set(USER_HEADERS.role, user.role);
  headers.set(USER_HEADERS.name, encodeURIComponent(user.full_name));
  headers.set(USER_HEADERS.email, user.email);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
