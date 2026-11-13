"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, FileText, Loader2, NotebookPen, Pencil, Trash2, UploadCloud, X } from "lucide-react";
import type { KnowledgeItem } from "@/lib/types";
import { Badge, api, errText, formatDateTime } from "@/components/ui";

const ACCEPT = ".pdf,.docx,.xlsx,.csv,.txt,.md";
const MAX_FILE_MB = 4;

interface KnowledgeResponse {
  items: KnowledgeItem[];
  stats: { total: number; active: number; active_chars: number; max_chars: number };
}

type Notice = { type: "success" | "error" | "info"; text: string; details?: string[] } | null;

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function KnowledgeTab({ active }: { active: boolean }) {
  const [data, setData] = useState<KnowledgeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [manual, setManual] = useState({ title: "", content: "" });
  const [savingManual, setSavingManual] = useState(false);

  const [editItem, setEditItem] = useState<KnowledgeItem | null>(null);
  const [editForm, setEditForm] = useState({ title: "", content: "" });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<KnowledgeResponse>("/api/knowledge"));
      setLoadError(null);
    } catch (err) {
      setLoadError(errText(err));
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    const tooBig = list.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig.length) {
      setNotice({ type: "error", text: `File melebihi ${MAX_FILE_MB} MB: ${tooBig.map((f) => f.name).join(", ")}` });
      return;
    }
    setUploading(true);
    setNotice(null);
    try {
      const form = new FormData();
      for (const f of list) form.append("files", f);
      const res = await fetch("/api/knowledge/upload", { method: "POST", body: form, cache: "no-store" });
      if (res.status === 401) {
        window.location.replace("/login");
        return;
      }
      const json = (await res.json().catch(() => ({}))) as {
        created?: KnowledgeItem[];
        failed?: Array<{ file: string; error: string }>;
        error?: string;
      };
      if (json.error && !json.created) throw new Error(json.error);
      const created = json.created ?? [];
      const failed = json.failed ?? [];
      setNotice({
        type: failed.length ? (created.length ? "info" : "error") : "success",
        text: `${created.length} file berhasil ditambahkan${failed.length ? `, ${failed.length} gagal` : ""}. ${
          created.length ? "Cek isi teksnya lewat tombol Lihat/Edit untuk memastikan terbaca benar." : ""
        }`,
        details: failed.map((f) => `${f.file}: ${f.error}`),
      });
      await load();
    } catch (err) {
      setNotice({ type: "error", text: errText(err) });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    setSavingManual(true);
    setNotice(null);
    try {
      await api("/api/knowledge", { method: "POST", body: JSON.stringify(manual) });
      setManual({ title: "", content: "" });
      setNotice({ type: "success", text: "Materi manual ditambahkan. Bot langsung memakainya di balasan berikutnya." });
      await load();
    } catch (err) {
      setNotice({ type: "error", text: errText(err) });
    } finally {
      setSavingManual(false);
    }
  }

  async function patchItem(item: KnowledgeItem, body: Partial<Pick<KnowledgeItem, "title" | "content" | "is_active">>) {
    setBusyId(item.id);
    setNotice(null);
    try {
      await api(`/api/knowledge/${item.id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
      return true;
    } catch (err) {
      setNotice({ type: "error", text: errText(err) });
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function deleteItem(item: KnowledgeItem) {
    if (!window.confirm(`Hapus materi "${item.title}"? Bot tidak akan memakainya lagi.`)) return;
    setBusyId(item.id);
    try {
      await api(`/api/knowledge/${item.id}`, { method: "DELETE" });
      setNotice({ type: "success", text: `Materi "${item.title}" dihapus.` });
      await load();
    } catch (err) {
      setNotice({ type: "error", text: errText(err) });
    } finally {
      setBusyId(null);
    }
  }

  const stats = data?.stats;
  const usagePct = stats ? Math.min(100, (stats.active_chars / stats.max_chars) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <BookOpen className="h-5 w-5 text-red-600" /> Knowledge Base Chatbot
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Materi aktif (harga OTR, lokasi dealer, promo, spesifikasi, FAQ) dibaca bot di <b>setiap balasan</b>. Tidak perlu training
            ulang: materi baru atau perubahan langsung berlaku. Bot tetap mengoper ke Sales setelah nama, domisili, dan unit lengkap.
          </p>
        </div>

        {/* Pemakaian */}
        {stats && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-600">
              <span>
                <b className="text-slate-900">{stats.active}</b> materi aktif dari {stats.total} ·{" "}
                {stats.active_chars.toLocaleString("id-ID")} / {stats.max_chars.toLocaleString("id-ID")} karakter (~
                {Math.round(stats.active_chars / 4).toLocaleString("id-ID")} token per balasan bot)
              </span>
              {usagePct >= 100 && <span className="font-medium text-red-600">Melebihi batas — materi terlama tidak terbaca bot</span>}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${usagePct >= 100 ? "bg-red-500" : usagePct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
          </div>
        )}

        {notice && (
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              notice.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : notice.type === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {notice.text}
            {notice.details && notice.details.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-xs">
                {notice.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Upload file */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <UploadCloud className="h-4 w-4" /> Upload File Materi
            </h3>
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInput.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void upload(e.dataTransfer.files);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
                dragOver ? "border-red-400 bg-red-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {uploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-red-600" />
              ) : (
                <UploadCloud className="h-8 w-8 text-slate-400" />
              )}
              <p className="text-sm font-medium text-slate-700">
                {uploading ? "Membaca & menyimpan materi..." : "Klik atau tarik file ke sini"}
              </p>
              <p className="text-xs text-slate-500">
                PDF, Word (.docx), Excel (.xlsx), CSV, TXT · maks. {MAX_FILE_MB} MB per file · bisa beberapa sekaligus
              </p>
            </div>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => e.target.files && void upload(e.target.files)}
            />
            <p className="mt-2 text-[11px] text-slate-500">
              PDF hasil scan/foto tidak bisa dibaca. Untuk pricelist, Excel/CSV paling akurat karena struktur tabelnya terjaga.
            </p>
          </div>

          {/* Tambah manual */}
          <form onSubmit={addManual} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <NotebookPen className="h-4 w-4" /> Tulis Materi Manual
            </h3>
            <input
              required
              value={manual.title}
              onChange={(e) => setManual((m) => ({ ...m, title: e.target.value }))}
              placeholder="Judul, mis. Promo Desember 2026"
              maxLength={150}
              className={inputClass}
            />
            <textarea
              required
              rows={5}
              value={manual.content}
              onChange={(e) => setManual((m) => ({ ...m, content: e.target.value }))}
              placeholder={"Isi materi, mis.\nPromo Desember: cashback Xpander Rp 10 juta untuk pembelian sampai 31 Des 2026.\nDealer DIPO Medan: Jl. Gatot Subroto No. 5, buka Senin–Sabtu 08.00–17.00."}
              className={`${inputClass} mt-2 resize-y`}
            />
            <div className="mt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingManual}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {savingManual && <Loader2 className="h-4 w-4 animate-spin" />}
                Simpan Materi
              </button>
            </div>
          </form>
        </div>

        {/* Daftar materi */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-800">Daftar Materi</h3>
          </div>
          {loadError && <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{loadError}</div>}
          {!data && !loadError && (
            <div className="flex justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          )}
          {data && data.items.length === 0 && (
            <p className="p-8 text-center text-sm text-slate-500">
              Belum ada materi. Upload pricelist, daftar dealer, atau brosur agar bot bisa menjawab pertanyaan pelanggan.
            </p>
          )}
          <ul className="divide-y divide-slate-100">
            {data?.items.map((item) => (
              <li key={item.id} className={`flex flex-wrap items-start gap-3 px-4 py-3 ${item.is_active ? "" : "opacity-60"}`}>
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    {item.source_type === "file" ? (
                      <Badge className="bg-slate-50 text-slate-600 ring-slate-200">
                        📎 {item.file_name} {item.file_size ? `· ${formatBytes(item.file_size)}` : ""}
                      </Badge>
                    ) : (
                      <Badge className="bg-violet-50 text-violet-700 ring-violet-200">✍️ Manual</Badge>
                    )}
                    <span>{item.content.length.toLocaleString("id-ID")} karakter</span>
                    <span>· diperbarui {formatDateTime(item.updated_at)}</span>
                    {item.created_by_name && <span>· oleh {item.created_by_name}</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-slate-600">{item.content.slice(0, 300)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={item.is_active}
                      disabled={busyId === item.id}
                      onChange={(e) => void patchItem(item, { is_active: e.target.checked })}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    Aktif
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setEditItem(item);
                      setEditForm({ title: item.title, content: item.content });
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Pencil className="h-3 w-3" /> Lihat/Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteItem(item)}
                    disabled={busyId === item.id}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    aria-label={`Hapus ${item.title}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Modal edit */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setEditItem(null)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Edit materi"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await patchItem(editItem, editForm);
              if (ok) {
                setEditItem(null);
                setNotice({ type: "success", text: "Materi diperbarui. Bot langsung memakai versi terbaru." });
              }
            }}
            className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold">Lihat / Edit Materi</h3>
              <button type="button" onClick={() => setEditItem(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Tutup">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
              <input
                required
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={150}
                className={inputClass}
              />
              <textarea
                required
                value={editForm.content}
                onChange={(e) => setEditForm((f) => ({ ...f, content: e.target.value }))}
                className={`${inputClass} min-h-[300px] flex-1 resize-y font-mono text-xs leading-relaxed`}
              />
              <p className="text-[11px] text-slate-500">
                Ini teks yang dibaca bot. Koreksi bila ada yang salah baca (mis. kolom tabel harga tertukar). {editForm.content.length.toLocaleString("id-ID")}{" "}
                karakter.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button type="button" onClick={() => setEditItem(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                Batal
              </button>
              <button
                type="submit"
                disabled={busyId === editItem.id}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {busyId === editItem.id && <Loader2 className="h-4 w-4 animate-spin" />}
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
