import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorMessage, jsonError } from "@/lib/http";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, getAuthSecret, sessionCookieOptions, signSession } from "@/lib/auth/session";
import { isValidEmail, normalizeEmail } from "@/lib/auth/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const INVALID_CREDENTIALS = "Email atau password salah.";

interface DbUserRow {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "agent";
  password_hash: string;
  is_active: boolean;
  session_version: number;
  failed_login_count: number;
  locked_until: string | null;
}

let dummyHash: Promise<string> | null = null;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Admin pertama: jika tabel app_users masih kosong dan kredensial cocok dengan
 * ADMIN_EMAIL / ADMIN_PASSWORD, akun admin dibuat otomatis. Setelah ada user,
 * env ini tidak dipakai lagi.
 */
async function bootstrapAdmin(email: string, password: string): Promise<DbUserRow | null> {
  const envEmail = normalizeEmail(process.env.ADMIN_EMAIL);
  const envPassword = process.env.ADMIN_PASSWORD ?? "";
  if (!envEmail || validatePassword(envPassword) || !safeEqual(email, envEmail) || !safeEqual(password, envPassword)) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { count, error: countError } = await supabase.from("app_users").select("id", { count: "exact", head: true });
  if (countError) throw countError;
  if ((count ?? 0) > 0) return null;

  const { data, error } = await supabase
    .from("app_users")
    .insert({
      email,
      full_name: process.env.ADMIN_NAME?.trim() || "Administrator",
      role: "admin",
      password_hash: await hashPassword(password),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as DbUserRow;
}

/** POST /api/auth/login - { email, password } */
export async function POST(req: NextRequest) {
  const secret = getAuthSecret();
  if (!secret) {
    return jsonError("Server belum dikonfigurasi: AUTH_SECRET wajib diisi (minimal 32 karakter).", 500);
  }

  let body: { email?: string; password?: string };
  try {
    body = (await req.json()) as { email?: string; password?: string };
  } catch {
    return jsonError("Body harus berupa JSON.");
  }
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!isValidEmail(email) || !password) return jsonError("Email dan password wajib diisi.");

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("app_users").select("*").eq("email", email).maybeSingle();
    if (error) throw error;

    let user = data as DbUserRow | null;
    if (!user) {
      user = await bootstrapAdmin(email, password);
      if (!user) {
        // Samakan waktu respons dengan user yang ada (mencegah enumerasi email).
        dummyHash ??= hashPassword("dummy-password-for-timing");
        await verifyPassword(password, await dummyHash);
        return jsonError(INVALID_CREDENTIALS, 401);
      }
    } else {
      if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
        const minutes = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
        return jsonError(`Terlalu banyak percobaan gagal. Akun dikunci sementara, coba lagi ${minutes} menit lagi.`, 429);
      }

      if (!(await verifyPassword(password, user.password_hash))) {
        const failed = user.failed_login_count + 1;
        const lock = failed >= MAX_FAILED_ATTEMPTS;
        await supabase
          .from("app_users")
          .update({
            failed_login_count: lock ? 0 : failed,
            locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : user.locked_until,
          })
          .eq("id", user.id);
        return jsonError(
          lock ? `Terlalu banyak percobaan gagal. Akun dikunci ${LOCK_MINUTES} menit.` : INVALID_CREDENTIALS,
          lock ? 429 : 401,
        );
      }

      if (!user.is_active) return jsonError("Akun Anda dinonaktifkan. Hubungi Admin.", 403);

      await supabase
        .from("app_users")
        .update({ failed_login_count: 0, locked_until: null, last_login_at: new Date().toISOString() })
        .eq("id", user.id);
    }

    const token = await signSession({ uid: user.id, ver: user.session_version }, secret);
    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (err) {
    console.error("[auth/login]", errorMessage(err));
    return jsonError("Login gagal karena kesalahan server. Coba lagi.", 500);
  }
}
