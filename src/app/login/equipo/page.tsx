"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function EquipoLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Credenciales inválidas. Verifica tu email y contraseña.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-6 relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239CFF00' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />

      <form onSubmit={onSubmit} className="relative w-full max-w-md glass-panel p-10 space-y-6 shadow-2xl">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-serif tracking-wider text-[var(--text)]">
            AT INFORMA
          </h1>
          <p className="text-xs text-[var(--gold)] uppercase tracking-[0.25em]">
            Panel del Equipo
          </p>
        </div>

        {/* Email field */}
        <div className="space-y-2">
          <label className="block text-[11px] text-[var(--text-muted)] uppercase tracking-widest">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="abogado@estudio.cl"
            required
            className="w-full bg-[var(--bg)] border border-[var(--border-subtle)] text-[var(--text)] rounded px-4 py-3 text-sm outline-none focus:border-[var(--gold)] transition-colors placeholder:text-[var(--text-muted)]"
          />
        </div>

        {/* Password field */}
        <div className="space-y-2">
          <label className="block text-[11px] text-[var(--text-muted)] uppercase tracking-widest">
            Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full bg-[var(--bg)] border border-[var(--border-subtle)] text-[var(--text)] rounded px-4 py-3 text-sm outline-none focus:border-[var(--gold)] transition-colors placeholder:text-[var(--text-muted)]"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[var(--gold)] text-[#050606] font-semibold text-xs uppercase tracking-widest rounded py-3.5 disabled:opacity-50 hover:bg-[var(--lemon-soft)] transition-colors"
        >
          {loading ? "Ingresando…" : "Ingresar al Panel"}
        </button>

        {/* Footer links */}
        <div className="text-center pt-2">
          <Link
            href="/login"
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            ← Portal clientes
          </Link>
        </div>
      </form>
    </main>
  );
}
