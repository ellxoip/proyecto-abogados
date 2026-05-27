"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@legalfinance.local");
  const [password, setPassword] = useState("Admin123!");
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
    <main
      className="relative min-h-screen w-full overflow-hidden bg-[#0B0C10] text-white"
      style={{
        backgroundImage: "url('/brand/login-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 50%, rgba(11,12,16,0.45) 0%, rgba(11,12,16,0.78) 65%, rgba(11,12,16,0.92) 100%)",
        }}
      />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-md rounded-2xl border p-8 space-y-5 backdrop-blur-xl"
          style={{
            background:
              "linear-gradient(180deg, rgba(20,22,30,0.78) 0%, rgba(13,14,20,0.85) 100%)",
            borderColor: "rgba(201,168,76,0.35)",
            boxShadow:
              "0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 60px rgba(201,168,76,0.12)",
          }}
        >
          <div className="space-y-1">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.32em]"
              style={{ color: "#E0B84A" }}
            >
              Acceso Interno
            </p>
            <h1
              className="text-2xl font-semibold"
              style={{ color: "#F5E7B8" }}
            >
              Hive Financial Control
            </h1>
            <p className="text-xs text-white/55">
              Sistema contable interno · Legal Finance MVP
            </p>
          </div>

          <label className="block space-y-1">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.24em]"
              style={{ color: "#E0B84A" }}
            >
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none transition focus:ring-2"
              style={{
                background: "rgba(11,12,16,0.6)",
                border: "1px solid rgba(201,168,76,0.25)",
              }}
            />
          </label>

          <label className="block space-y-1">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.24em]"
              style={{ color: "#E0B84A" }}
            >
              Contraseña
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none transition focus:ring-2"
              style={{
                background: "rgba(11,12,16,0.6)",
                border: "1px solid rgba(201,168,76,0.25)",
              }}
            />
          </label>

          {error ? (
            <p
              className="rounded-md px-3 py-2 text-xs"
              style={{
                color: "#FFB4B4",
                background: "rgba(180,40,40,0.18)",
                border: "1px solid rgba(180,40,40,0.4)",
              }}
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md py-2.5 text-sm font-semibold uppercase tracking-[0.18em] transition disabled:opacity-60"
            style={{
              background:
                "linear-gradient(180deg, #E0B84A 0%, #C9A84C 50%, #9C7E2C 100%)",
              color: "#0B0C10",
              boxShadow:
                "0 8px 24px rgba(201,168,76,0.35), 0 0 0 1px rgba(255,225,140,0.4) inset",
            }}
          >
            {loading ? "Ingresando…" : "Ingresar"}
          </button>

          <p className="text-[10px] text-white/45 leading-relaxed">
            Demo: <span className="font-mono text-white/70">admin@legalfinance.local / Admin123!</span>
            <br />
            <span className="font-mono text-white/70">contador@legalfinance.local / Contador123!</span>
          </p>
        </form>
      </div>
    </main>
  );
}
