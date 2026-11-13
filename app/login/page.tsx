"use client";

import { useState } from "react";
import { AlertTriangle, Car, Eye, EyeOff, Loader2, LogIn, ShieldCheck } from "lucide-react";

/** Hanya izinkan redirect ke path internal (cegah open redirect). */
function safeNext(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Login gagal (HTTP ${res.status}).`);
        setLoading(false);
        return;
      }
      window.location.replace(safeNext());
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-100 via-white to-red-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-600 text-white shadow-md">
            <Car className="h-6 w-6" />
          </div>
          <h1 className="mt-3 text-lg font-bold text-slate-900">Mitsubishi DIPO Lead & CAPI Hub</h1>
          <p className="mt-1 text-sm text-slate-500">Masuk untuk mengelola chat prospek</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-700">Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@dipo.co.id"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-700">Password</span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-3 pr-10 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Masuk
          </button>
        </form>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5" />
          Belum punya akun atau lupa password? Hubungi Admin.
        </p>
      </div>
    </main>
  );
}
