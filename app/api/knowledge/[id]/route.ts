import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorMessage, jsonError } from "@/lib/http";
import { getRequestUser } from "@/lib/auth/users";
import { KB_MAX_ITEM_CHARS } from "@/lib/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/knowledge/:id - { title?, content?, is_active? } (admin). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (getRequestUser(req)?.role !== "admin") return jsonError("Akses ditolak: fitur ini hanya untuk Admin.", 403);
  const { id } = await params;

  let body: { title?: string; content?: string; is_active?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError("Body harus berupa JSON.");
  }

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const title = String(body.title).replace(/\s+/g, " ").trim().slice(0, 150);
    if (!title) return jsonError("Judul materi wajib diisi.");
    patch.title = title;
  }
  if (body.content !== undefined) {
    const content = String(body.content).replace(/\r\n?/g, "\n").trim();
    if (!content) return jsonError("Isi materi tidak boleh kosong.");
    if (content.length > KB_MAX_ITEM_CHARS) return jsonError(`Isi materi maksimal ${KB_MAX_ITEM_CHARS.toLocaleString("id-ID")} karakter.`);
    patch.content = content;
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") return jsonError("is_active harus boolean.");
    patch.is_active = body.is_active;
  }
  if (Object.keys(patch).length === 0) return jsonError("Tidak ada perubahan.");

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("knowledge_items")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("Materi tidak ditemukan.", 404);
    return NextResponse.json({ ok: true, item: data });
  } catch (err) {
    console.error("[knowledge PATCH]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}

/** DELETE /api/knowledge/:id (admin). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (getRequestUser(req)?.role !== "admin") return jsonError("Akses ditolak: fitur ini hanya untuk Admin.", 403);
  const { id } = await params;
  try {
    const { error } = await getSupabaseAdmin().from("knowledge_items").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[knowledge DELETE]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}
