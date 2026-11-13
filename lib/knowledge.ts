/**
 * Knowledge base chatbot: ekstraksi teks dari file materi, memuat materi aktif
 * untuk prompt AI, dan pencarian baris relevan untuk bot rule-based.
 *
 * Bot tidak "dilatih" ulang: setiap kali membalas, materi aktif disisipkan ke
 * prompt. Materi baru langsung berlaku tanpa deploy ulang.
 */
import { getSupabaseAdmin } from "@/lib/supabase";
import { detectCity, detectUnit } from "@/lib/mitsubishi";

/** Batas total materi aktif yang dikirim ke AI per balasan (~40 ribu token). */
export const KB_MAX_CHARS = 150_000;
/** Batas ukuran 1 file upload (batas body request Vercel 4,5 MB). */
export const KB_MAX_FILE_BYTES = 4 * 1024 * 1024;
/** Batas isi 1 materi setelah diekstrak. */
export const KB_MAX_ITEM_CHARS = 100_000;

export const KB_ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".csv", ".txt", ".md"] as const;

// ---------------------------------------------------------------------
// Ekstraksi teks dari file
// ---------------------------------------------------------------------
export class KnowledgeExtractError extends Error {}

function extensionOf(fileName: string): string {
  const m = fileName.toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : "";
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).map((page, i) => `--- Halaman ${i + 1} ---\n${page}`).join("\n\n");
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

async function extractXlsx(buffer: Buffer): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const out: string[] = [];
  workbook.eachSheet((sheet) => {
    out.push(`--- Sheet: ${sheet.name} ---`);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        const text = String(cell.text ?? "").trim();
        if (text) cells.push(text);
      });
      if (cells.length) out.push(cells.join(" | "));
    });
  });
  return out.join("\n");
}

function extractCsv(buffer: Buffer): string {
  const text = buffer.toString("utf8").replace(/^﻿/, "");
  const delimiter = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) =>
      line
        .split(new RegExp(`${delimiter}(?=(?:[^"]*"[^"]*")*[^"]*$)`))
        .map((cell) => cell.trim().replace(/^"|"$/g, "").replace(/""/g, '"'))
        .filter(Boolean)
        .join(" | "),
    )
    .join("\n");
}

/** Ekstrak teks dari file materi. Melempar KnowledgeExtractError dengan pesan ramah. */
export async function extractKnowledgeText(fileName: string, buffer: Buffer): Promise<string> {
  const ext = extensionOf(fileName);
  let text: string;
  try {
    switch (ext) {
      case ".pdf":
        text = await extractPdf(buffer);
        break;
      case ".docx":
        text = await extractDocx(buffer);
        break;
      case ".xlsx":
        text = await extractXlsx(buffer);
        break;
      case ".csv":
        text = extractCsv(buffer);
        break;
      case ".txt":
      case ".md":
        text = buffer.toString("utf8").replace(/^﻿/, "");
        break;
      case ".xls":
      case ".doc":
        throw new KnowledgeExtractError(
          `Format ${ext} versi lama belum didukung. Simpan ulang sebagai ${ext === ".xls" ? ".xlsx" : ".docx"} lalu upload lagi.`,
        );
      default:
        throw new KnowledgeExtractError(
          `Format file tidak didukung. Gunakan: ${KB_ACCEPTED_EXTENSIONS.join(", ")}.`,
        );
    }
  } catch (err) {
    if (err instanceof KnowledgeExtractError) throw err;
    throw new KnowledgeExtractError(
      `Gagal membaca file (${err instanceof Error ? err.message : String(err)}). Pastikan file tidak rusak atau terkunci password.`,
    );
  }

  const cleaned = tidy(text.replace(/--- Halaman \d+ ---\s*(?=--- Halaman|$)/g, ""));
  const meaningful = cleaned.replace(/--- (Halaman \d+|Sheet: .*) ---/g, "").replace(/\s+/g, "");
  if (meaningful.length < 20) {
    throw new KnowledgeExtractError(
      ext === ".pdf"
        ? "Tidak ada teks yang bisa dibaca dari PDF ini (kemungkinan hasil scan/gambar). Gunakan PDF berbasis teks atau ketik materinya secara manual."
        : "File tidak berisi teks yang bisa dibaca.",
    );
  }
  return cleaned.slice(0, KB_MAX_ITEM_CHARS);
}

// ---------------------------------------------------------------------
// Memuat materi aktif untuk bot
// ---------------------------------------------------------------------
export interface KnowledgeSnapshot {
  text: string;
  itemCount: number;
  truncated: boolean;
}

/** Gabungkan semua materi aktif (terbaru dulu) sampai batas KB_MAX_CHARS. */
export async function loadActiveKnowledge(): Promise<KnowledgeSnapshot> {
  const { data, error } = await getSupabaseAdmin()
    .from("knowledge_items")
    .select("title, content, updated_at")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) {
    // Tabel belum dibuat (migrasi v4 belum dijalankan) -> bot tetap jalan tanpa KB.
    console.warn("[knowledge] gagal memuat knowledge base:", error.message);
    return { text: "", itemCount: 0, truncated: false };
  }

  const parts: string[] = [];
  let total = 0;
  let truncated = false;
  for (const item of data ?? []) {
    const block = `### ${item.title}\n${item.content}`.trim();
    if (total + block.length > KB_MAX_CHARS) {
      truncated = true;
      continue;
    }
    parts.push(block);
    total += block.length + 2;
  }
  if (truncated) console.warn(`[knowledge] materi aktif melebihi ${KB_MAX_CHARS} karakter; sebagian tidak dikirim ke AI.`);
  return { text: parts.join("\n\n"), itemCount: parts.length, truncated };
}

// ---------------------------------------------------------------------
// Pencarian sederhana (untuk bot rule-based / mode dummy)
// ---------------------------------------------------------------------
const STOP = new Set(
  "yang dan di ke dari untuk dengan ini itu ada apa berapa ya kak pak bu mas mbak min dong sih nih saya aku mau ingin tanya info boleh bisa gimana bagaimana kapan dimana mana".split(" "),
);

function keywords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOP.has(w)),
    ),
  );
}

/**
 * Cari baris materi yang paling relevan dengan pertanyaan pelanggan.
 * Baris yang menyebut unit/kota yang ditanyakan diberi bobot lebih.
 */
export function searchKnowledge(kbText: string, question: string, context: { unit?: string | null; domicile?: string | null } = {}, limit = 3): string[] {
  if (!kbText.trim() || !question.trim()) return [];
  const unit = (detectUnit(question) ?? context.unit ?? "").toLowerCase();
  const city = (detectCity(question) ?? context.domicile ?? "").toLowerCase();
  const words = keywords(question);
  const priceIntent = /\b(harga|price|otr|berapa|pricelist|dp|cicil\w*|kredit)\b/i.test(question);
  const locationIntent = /\b(alamat|lokasi|dealer|cabang|showroom|dimana|di mana|maps|buka|jam)\b/i.test(question);
  if (!unit && !city && words.length === 0) return [];

  const scored = kbText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 8 && line.length <= 400 && !line.startsWith("---") && !line.startsWith("###"))
    .map((line) => {
      const l = line.toLowerCase();
      let score = 0;
      if (unit && l.includes(unit)) score += 5;
      if (city && l.includes(city)) score += 3;
      for (const w of words) if (l.includes(w)) score += 1;
      if (priceIntent && /rp\s?[\d.]+|\d{2,3}(\.\d{3}){2,}/i.test(line)) score += 3;
      if (locationIntent && /\b(jl\.?|jalan|alamat|telp|buka|senin|sabtu|minggu)\b/i.test(line)) score += 3;
      // Pertanyaan harga untuk unit tertentu: baris tanpa nama unit kurang relevan.
      if (priceIntent && unit && !l.includes(unit)) score -= 3;
      return { line, score };
    })
    .filter((x) => x.score >= 4);

  scored.sort((a, b) => b.score - a.score);
  const out: string[] = [];
  for (const { line } of scored) {
    if (!out.includes(line)) out.push(line);
    if (out.length >= limit) break;
  }
  return out;
}
