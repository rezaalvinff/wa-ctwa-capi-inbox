import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorMessage, jsonError } from "@/lib/http";
import { getRequestUser } from "@/lib/auth/users";
import { KB_MAX_FILE_BYTES, KnowledgeExtractError, extractKnowledgeText } from "@/lib/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/knowledge/upload (multipart/form-data, field "files", boleh banyak) - admin.
 * Teks diekstrak dari PDF / DOCX / XLSX / CSV / TXT / MD lalu disimpan sebagai materi.
 * File aslinya tidak disimpan; isi teks bisa dicek & dikoreksi di tab Knowledge Base.
 */
export async function POST(req: NextRequest) {
  const me = getRequestUser(req);
  if (me?.role !== "admin") return jsonError("Akses ditolak: fitur ini hanya untuk Admin.", 403);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Upload gagal dibaca. Total ukuran file mungkin terlalu besar (maks. ±4 MB per upload).", 413);
  }
  const files = form.getAll("files").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (files.length === 0) return jsonError("Pilih minimal 1 file.");
  if (files.length > 10) return jsonError("Maksimal 10 file per upload.");

  const created: unknown[] = [];
  const failed: Array<{ file: string; error: string }> = [];

  for (const file of files) {
    try {
      if (file.size > KB_MAX_FILE_BYTES) {
        throw new KnowledgeExtractError(`Ukuran file melebihi ${KB_MAX_FILE_BYTES / 1024 / 1024} MB.`);
      }
      const content = await extractKnowledgeText(file.name, Buffer.from(await file.arrayBuffer()));
      const { data, error } = await getSupabaseAdmin()
        .from("knowledge_items")
        .insert({
          title: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 150) || file.name,
          source_type: "file",
          file_name: file.name.slice(0, 200),
          file_type: file.type || null,
          file_size: file.size,
          content,
          created_by: me.id,
          created_by_name: me.full_name || null,
        })
        .select("*")
        .single();
      if (error) throw error;
      created.push(data);
    } catch (err) {
      failed.push({
        file: file.name,
        error: err instanceof KnowledgeExtractError ? err.message : `Gagal menyimpan: ${errorMessage(err)}`,
      });
    }
  }

  return NextResponse.json({ ok: failed.length === 0, created, failed }, { status: created.length ? 201 : 400 });
}
