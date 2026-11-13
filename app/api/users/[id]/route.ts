import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorMessage, jsonError } from "@/lib/http";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { SESSION_COOKIE, getAuthSecret, sessionCookieOptions, signSession } from "@/lib/auth/session";
import { PUBLIC_USER_COLUMNS, cleanRegions, getRequestUser } from "@/lib/auth/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
  full_name?: string;
  role?: string;
  is_active?: boolean;
  password?: string;
  regions?: unknown;
}

/**
 * PATCH /api/users/:id (admin)
 * Ubah nama, role, wilayah (agent), status aktif, atau reset password.
 * Perubahan role/status/password menaikkan session_version -> sesi lama user tsb otomatis logout.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = getRequestUser(req);
  if (me?.role !== "admin") return jsonError("Akses ditolak: fitur ini hanya untuk Admin.", 403);
  const { id } = await params;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return jsonError("Body harus berupa JSON.");
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: target, error: targetError } = await supabase
      .from("app_users")
      .select("id, role, is_active, session_version")
      .eq("id", id)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) return jsonError("User tidak ditemukan.", 404);

    const isSelf = target.id === me.id;
    const patch: Record<string, unknown> = {};
    let revokeSessions = false;

    if (body.full_name !== undefined) {
      const name = String(body.full_name).replace(/\s+/g, " ").trim().slice(0, 100);
      if (!name) return jsonError("Nama wajib diisi.");
      patch.full_name = name;
    }
    if (body.role !== undefined) {
      if (body.role !== "admin" && body.role !== "agent") return jsonError("Role harus 'admin' atau 'agent'.");
      if (isSelf && body.role !== target.role) return jsonError("Anda tidak bisa mengubah role akun sendiri.");
      if (body.role !== target.role) {
        patch.role = body.role;
        revokeSessions = true;
      }
    }
    if (body.is_active !== undefined) {
      if (typeof body.is_active !== "boolean") return jsonError("is_active harus boolean.");
      if (isSelf && !body.is_active) return jsonError("Anda tidak bisa menonaktifkan akun sendiri.");
      if (body.is_active !== target.is_active) {
        patch.is_active = body.is_active;
        revokeSessions = true;
      }
    }
    if (body.regions !== undefined) {
      const regions = cleanRegions(body.regions);
      if (!Array.isArray(regions)) return jsonError(regions.error);
      patch.regions = regions;
    }
    if (body.password !== undefined) {
      const passwordError = validatePassword(body.password);
      if (passwordError) return jsonError(passwordError);
      patch.password_hash = await hashPassword(body.password);
      patch.failed_login_count = 0;
      patch.locked_until = null;
      revokeSessions = true;
    }
    if (Object.keys(patch).length === 0) return jsonError("Tidak ada perubahan.");

    // Pastikan selalu tersisa minimal 1 admin aktif.
    const losesAdmin =
      target.role === "admin" && target.is_active && (patch.role === "agent" || patch.is_active === false);
    if (losesAdmin) {
      const { count, error: countError } = await supabase
        .from("app_users")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true)
        .neq("id", target.id);
      if (countError) throw countError;
      if ((count ?? 0) === 0) return jsonError("Harus ada minimal 1 Admin aktif.");
    }

    const newVersion = revokeSessions ? target.session_version + 1 : target.session_version;
    const { data: updated, error: updateError } = await supabase
      .from("app_users")
      .update({ ...patch, session_version: newVersion, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(PUBLIC_USER_COLUMNS)
      .single();
    if (updateError) throw updateError;

    const res = NextResponse.json({ ok: true, user: updated });
    // Admin mengganti password sendiri -> perbarui cookie agar tidak ikut ter-logout.
    const secret = getAuthSecret();
    if (isSelf && revokeSessions && secret) {
      res.cookies.set(SESSION_COOKIE, await signSession({ uid: me.id, ver: newVersion }, secret), sessionCookieOptions());
    }
    return res;
  } catch (err) {
    console.error("[users PATCH]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}
