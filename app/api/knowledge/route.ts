import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorMessage, jsonError } from "@/lib/http";
import { getRequestUser } from "@/lib/auth/users";
import { KB_MAX_CHARS, KB_MAX_ITEM_CHARS } from "@/lib/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/knowledge - semua materi + statistik ukuran (admin). */
export async function GET(req: NextRequest) {
  if (getRequestUser(req)?.role !== "admin") return jsonError("Akses ditolak: fitur ini hanya untuk Admin.", 403);
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("knowledge_items")
      .select("id, title, source_type, file_name, file_type, file_size, content, is_active, created_by_name, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    const items = data ?? [];
    const activeChars = items.filter((i) => i.is_active).reduce((sum, i) => sum + (i.content?.length ?? 0) + i.title.length + 6, 0);
    return NextResponse.json({
      ok: true,
      items,
      stats: { total: items.length, active: items.filter((i) => i.is_active).length, active_chars: activeChars, max_chars: KB_MAX_CHARS },
    });
  } catch (err) {
    console.error("[knowledge GET]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}

/** POST /api/knowledge - tambah materi manual { title, content } (admin). */
export async function POST(req: NextRequest) {
  const me = getRequestUser(req);
  if (me?.role !== "admin") return jsonError("Akses ditolak: fitur ini hanya untuk Admin.", 403);

  let body: { title?: string; content?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError("Body harus berupa JSON.");
  }
  const title = String(body.title ?? "").replace(/\s+/g, " ").trim().slice(0, 150);
  const content = String(body.content ?? "").replace(/\r\n?/g, "\n").trim();
  if (!title) return jsonError("Judul materi wajib diisi.");
  if (!content) return jsonError("Isi materi wajib diisi.");
  if (content.length > KB_MAX_ITEM_CHARS) return jsonError(`Isi materi maksimal ${KB_MAX_ITEM_CHARS.toLocaleString("id-ID")} karakter.`);

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("knowledge_items")
      .insert({ title, content, source_type: "manual", created_by: me.id, created_by_name: me.full_name || null })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, item: data }, { status: 201 });
  } catch (err) {
    console.error("[knowledge POST]", errorMessage(err));
    return jsonError(errorMessage(err), 500);
  }
}
