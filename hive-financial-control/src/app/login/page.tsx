"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@legalfinance.local");
  const [password, setPassword] = useState("Admin1234!");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "No se pudo iniciar sesión");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-md p-6 space-y-4">
        <div>
          <p className="text-sm text-[var(--muted)]">Acceso Interno</p>
          <h1 className="text-2xl font-semibold">Legal Finance MVP</h1>
        </div>
        <label className="block space-y-1">
          <span className="text-sm">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-[var(--border)] rounded-md px-3 py-2 bg-white"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Contraseña</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-[var(--border)] rounded-md px-3 py-2 bg-white"
          />
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-[#12212f] text-white py-2 font-medium disabled:opacity-60"
        >
          {loading ? "Ingresando..." : "Ingresar"}
        </button>

        <p className="text-xs text-[var(--muted)]">
          Demo: `admin@legalfinance.local / Admin123!` o `contador@legalfinance.local /
          Contador123!`
        </p>
      </form>
    </div>
  );
}
