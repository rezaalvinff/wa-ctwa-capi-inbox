import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorMessage, jsonError } from "@/lib/http";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { PUBLIC_USER_COLUMNS, cleanRegions, getRequestUser, isValidEmail, normalizeEmail } from "@/lib/auth/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireAdmin(req: NextRequest) {
  const me = getRequestUser(req);
  return me?.role === "admin" ? me : null;
}

/** GET /api/users - daftar user (admin). */
export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return jsonError("Akses ditolak: fitur ini hanya untuk Admin.", 403);
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("app_users")
      .select(PUBLIC_USER_COLUMNS)
      .order("role", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ ok: true, users: data ?? [] });
  } catch (err) {
    console.error("[users GET]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}

/** POST /api/users - { full_name, email, role, password, regions? } (admin). */
export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return jsonError("Akses ditolak: fitur ini hanya untuk Admin.", 403);

  let body: { full_name?: string; email?: string; role?: string; password?: string; regions?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError("Body harus berupa JSON.");
  }

  const fullName = String(body.full_name ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  const email = normalizeEmail(body.email);
  const role = body.role === "admin" ? "admin" : body.role === "agent" ? "agent" : null;
  if (!fullName) return jsonError("Nama wajib diisi.");
  if (!isValidEmail(email)) return jsonError("Format email tidak valid.");
  if (!role) return jsonError("Role harus 'admin' atau 'agent'.");
  const passwordError = validatePassword(body.password);
  if (passwordError) return jsonError(passwordError);
  const regions = body.regions === undefined ? [] : cleanRegions(body.regions);
  if (!Array.isArray(regions)) return jsonError(regions.error);

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("app_users")
      .insert({ full_name: fullName, email, role, regions, password_hash: await hashPassword(body.password as string) })
      .select(PUBLIC_USER_COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") return jsonError("Email sudah terdaftar.", 409);
      throw error;
    }
    return NextResponse.json({ ok: true, user: data }, { status: 201 });
  } catch (err) {
    console.error("[users POST]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}
