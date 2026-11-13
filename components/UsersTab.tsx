"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, ShieldCheck, UserCog, UserRound, X } from "lucide-react";
import type { AppUser, UserRole } from "@/lib/types";
import { Badge, api, errText, formatDateTime, relativeTime } from "@/components/ui";

type Notice = { type: "success" | "error"; text: string } | null;

const ROLE_LABEL: Record<UserRole, string> = { admin: "Admin", agent: "Agent" };

export function RoleBadge({ role }: { role: UserRole }) {
  return role === "admin" ? (
    <Badge className="bg-red-50 text-red-700 ring-red-200">
      <ShieldCheck className="h-3 w-3" /> Admin
    </Badge>
  ) : (
    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
      <UserRound className="h-3 w-3" /> Agent
    </Badge>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20";

export default function UsersTab({ active, currentUserId }: { active: boolean; currentUserId: string | null }) {
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [form, setForm] = useState({ full_name: "", email: "", role: "agent" as UserRole, password: "" });
  const [creating, setCreating] = useState(false);

  const [resetUser, setResetUser] = useState<AppUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<{ users: AppUser[] }>("/api/users");
      setUsers(res.users);
      setLoadError(null);
    } catch (err) {
      setLoadError(errText(err));
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setNotice(null);
    try {
      const res = await api<{ user: AppUser }>("/api/users", { method: "POST", body: JSON.stringify(form) });
      setForm({ full_name: "", email: "", role: "agent", password: "" });
      setNotice({ type: "success", text: `Akun ${res.user.full_name} (${ROLE_LABEL[res.user.role]}) berhasil dibuat.` });
      await load();
    } catch (err) {
      setNotice({ type: "error", text: errText(err) });
    } finally {
      setCreating(false);
    }
  }

  async function patchUser(user: AppUser, body: Partial<Pick<AppUser, "role" | "is_active">> & { password?: string }, success: string) {
    setBusyId(user.id);
    setNotice(null);
    try {
      await api(`/api/users/${user.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setNotice({ type: "success", text: success });
      await load();
      return true;
    } catch (err) {
      setNotice({ type: "error", text: errText(err) });
      return false;
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <UserCog className="h-5 w-5 text-red-600" /> Kelola Pengguna
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            <b>Admin</b> dapat mengakses semua fitur. <b>Agent</b> hanya dapat mengakses Inbox & Chatbot.
          </p>
        </div>

        {notice && (
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {notice.text}
          </div>
        )}

        {/* Form tambah user */}
        <form onSubmit={createUser} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <Plus className="h-4 w-4" /> Tambah Pengguna
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              required
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="Nama lengkap"
              maxLength={100}
              className={inputClass}
            />
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="email@dipo.co.id"
              className={inputClass}
            />
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
              className={inputClass}
            >
              <option value="agent">Agent (Inbox saja)</option>
              <option value="admin">Admin (semua akses)</option>
            </select>
            <input
              required
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Password (min. 8 karakter)"
              className={inputClass}
            />
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Buat Akun
            </button>
          </div>
        </form>

        {/* Daftar user */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {loadError && <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{loadError}</div>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Nama & Email</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Login Terakhir</th>
                  <th className="px-4 py-2.5 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!users && !loadError && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                    </td>
                  </tr>
                )}
                {users?.map((u) => {
                  const isSelf = u.id === currentUserId;
                  const busy = busyId === u.id;
                  return (
                    <tr key={u.id} className={u.is_active ? "" : "bg-slate-50/70 text-slate-400"}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {u.full_name} {isSelf && <span className="text-xs font-normal text-slate-400">(Anda)</span>}
                        </p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        {isSelf ? (
                          <RoleBadge role={u.role} />
                        ) : (
                          <select
                            value={u.role}
                            disabled={busy}
                            onChange={(e) => {
                              const role = e.target.value as UserRole;
                              void patchUser(u, { role }, `Role ${u.full_name} diubah menjadi ${ROLE_LABEL[role]}. Sesi lamanya otomatis logout.`);
                            }}
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                            aria-label={`Role ${u.full_name}`}
                          >
                            <option value="agent">Agent</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.is_active ? (
                          <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">Aktif</Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-500 ring-slate-200">Nonaktif</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500" title={formatDateTime(u.last_login_at)}>
                        {u.last_login_at ? relativeTime(u.last_login_at) : "Belum pernah"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setResetUser(u);
                              setResetPassword("");
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <KeyRound className="h-3 w-3" /> Reset Password
                          </button>
                          {!isSelf && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                patchUser(
                                  u,
                                  { is_active: !u.is_active },
                                  u.is_active ? `${u.full_name} dinonaktifkan dan langsung logout.` : `${u.full_name} diaktifkan kembali.`,
                                )
                              }
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                                u.is_active
                                  ? "border border-red-200 text-red-700 hover:bg-red-50"
                                  : "border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              }`}
                            >
                              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                              {u.is_active ? "Nonaktifkan" : "Aktifkan"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal reset password */}
      {resetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setResetUser(null)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Reset password"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await patchUser(
                resetUser,
                { password: resetPassword },
                `Password ${resetUser.full_name} berhasil direset${resetUser.id === currentUserId ? "" : " dan sesi lamanya otomatis logout"}.`,
              );
              if (ok) setResetUser(null);
            }}
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Reset Password</h3>
              <button type="button" onClick={() => setResetUser(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Tutup">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              {resetUser.full_name} · {resetUser.email}
            </p>
            <input
              type="password"
              autoComplete="new-password"
              autoFocus
              required
              minLength={8}
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="Password baru (min. 8 karakter)"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={busyId === resetUser.id}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {busyId === resetUser.id && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan Password Baru
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
