"use client";

import Image from "next/image";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { Lock, Mail, ArrowRight, ShieldCheck, ScrollText, Briefcase, Eye, EyeOff, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

const DEMO_CLIENT = {
  email: "cliente@gmail.com",
  password: "Cliente2026!",
};
const SHOW_DEMO = process.env.NEXT_PUBLIC_HIDE_DEMO_CREDS !== "true";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RUT_PATTERN = /^\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]$/;

function validateLogin(identifier: string, password: string) {
  const cleanIdentifier = identifier.trim();
  if (!cleanIdentifier) return "Ingresa tu RUT o correo electronico.";
  if (!EMAIL_PATTERN.test(cleanIdentifier) && !RUT_PATTERN.test(cleanIdentifier)) {
    return "Ingresa un RUT o correo electronico valido.";
  }
  if (password.length < 6) return "La contrasena debe tener al menos 6 caracteres.";
  return null;
}

export default function ClientLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function performLogin(emailToUse: string, passwordToUse: string) {
    const identifier = emailToUse.trim();
    const validationError = validateLogin(identifier, passwordToUse);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    const res = await signIn("credentials", { email: identifier, password: passwordToUse, redirect: false });

    setLoading(false);

    if (res?.error) {
      setError("Credenciales inválidas. Verifica tu RUT o correo y tu contraseña.");
      return;
    }

    // Navegación dura (no router.push): fuerza un GET / completo que el
    // middleware redirige con 307 limpio al portal/admin. Evita el loop de
    // "Cargando/Procesando" en navegadores in-app que no siguen el redirect
    // por streaming de un router.push.
    window.location.assign("/");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await performLogin(email, password);
  }

  async function useDemo() {
    setEmail(DEMO_CLIENT.email);
    setPassword(DEMO_CLIENT.password);
    await performLogin(DEMO_CLIENT.email, DEMO_CLIENT.password);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0B0C10] text-white">
      {/* ── Fullscreen background image ───────────────────────────────────── */}
      <Image
        src="/brand/login-hero-hive.png"
        alt="Hive Control — Sistema de gestión legal con trazabilidad forense, inteligencia legal y panel digital sobre escritorio jurídico"
        fill
        priority
        className="object-cover"
        sizes="100vw"
      />
      {/* Slight darkening for readability — the image is already mostly dark */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(6,7,10,0.36) 0%, rgba(6,7,10,0.08) 42%, rgba(6,7,10,0.22) 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(4,5,8,0.22) 0%, rgba(4,5,8,0.08) 45%, rgba(4,5,8,0.48) 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute hidden lg:block"
        style={{
          left: "27.5%",
          top: "8%",
          width: "37.5%",
          height: "84%",
          borderRadius: "14px",
          background: "transparent",
        }}
      />

      {/* ── Foreground: hero copy (left) + form (right) ───────────────────── */}
      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.15fr_0.85fr]">
        {/* Hero copy */}
        <section className="flex flex-col justify-between p-7 sm:p-10 lg:p-14">
          {/* Brand strip */}
          <div className="flex items-center gap-4">
            <div
              className="rounded-2xl p-2.5"
              style={{
                background: "rgba(255,255,255,0.98)",
                boxShadow: "0 18px 48px -12px rgba(201,168,76,0.45), 0 2px 6px rgba(0,0,0,0.30)",
              }}
            >
              <BrandMark size="sm" />
            </div>
            <div className="hidden sm:block">
              <p className="text-[10px] uppercase tracking-[0.42em] text-white">Legal Operating System</p>
            </div>
          </div>

          {/* Hero copy */}
          <div className="max-w-xl mt-10 lg:mt-0">
            <div className="mb-6 inline-flex items-center gap-3" aria-hidden>
              <span className="h-px w-10" style={{ background: "var(--gold)" }} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.42em]" style={{ color: "var(--gold-soft)" }}>
                Estudio Jurídico · Edición Profesional
              </span>
            </div>
            <h1
              className="font-serif text-4xl leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]"
              style={{ textShadow: "0 6px 28px rgba(0,0,0,0.75)" }}
            >
              Donde el derecho{" "}
              <span style={{ color: "var(--gold-soft)" }}>se ordena</span> con precisión.
            </h1>
            <p
              className="mt-5 max-w-lg text-[15px] leading-7 text-white"
              style={{ textShadow: "0 2px 14px rgba(0,0,0,0.65)" }}
            >
              Plataforma diseñada para abogados que valoran la discreción, el rigor procesal y la
              trazabilidad absoluta de cada expediente. Inicia sesión y vuelve a tu escritorio.
            </p>

            <div
              className="mt-9 flex flex-wrap items-center gap-6 text-[11px] uppercase tracking-[0.28em] text-white"
              style={{ textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}
            >
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" style={{ color: "var(--gold-soft)" }} />
                Cifrado de Sesión
              </span>
              <span className="inline-flex items-center gap-2">
                <ScrollText className="h-4 w-4" style={{ color: "var(--gold-soft)" }} />
                Bitácora Forense
              </span>
              <span className="inline-flex items-center gap-2">
                <Briefcase className="h-4 w-4" style={{ color: "var(--gold-soft)" }} />
                Gestión Integral
              </span>
            </div>
          </div>

          {/* Footer crest */}
          <div
            className="mt-10 lg:mt-0 flex items-end justify-between gap-4"
            style={{ textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}
          >
            <p className="text-[10px] uppercase tracking-[0.38em] text-white">
              Justicia · Precisión · Discreción
            </p>
            <p className="text-[10px] tracking-[0.18em] text-white">v3.0 · Legal OS</p>
          </div>
        </section>

        {/* Form panel — translucent glass so the background image shows through */}
        <section className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-14">
          <form
            onSubmit={onSubmit}
            className="relative w-full max-w-md rounded-[20px] border p-8 sm:p-10"
            style={{
              background: "rgba(255, 255, 255, 0.99)",
              borderColor: "rgba(255, 255, 255, 0.72)",
              boxShadow: "0 34px 80px -22px rgba(0,0,0,0.62), 0 12px 28px -10px rgba(0,0,0,0.34)",
            }}
          >
            {/* Top gold rule */}
            <div className="-mt-8 mb-7 flex items-center gap-3 sm:-mt-10">
              <span
                className="h-[2px] flex-1 rounded-full"
                style={{ background: "linear-gradient(90deg, transparent 0%, var(--gold) 50%, transparent 100%)" }}
              />
            </div>

            <div className="flex flex-col items-center gap-3 text-center">
              <BrandMark size="md" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.42em]" style={{ color: "var(--gold-deep)" }}>
                Acceso al Despacho
              </p>
              <h2 className="font-serif text-2xl leading-snug tracking-tight" style={{ color: "#1A1A1F" }}>
                Bienvenido de regreso.
              </h2>
              <p className="text-sm" style={{ color: "var(--gold-deep)" }}>
                Ingresa con las credenciales que recibiste de la firma.
              </p>
            </div>

            <div className="mt-8 space-y-5">
              {/* RUT or Email */}
              <div className="space-y-2">
                <label className="block text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: "var(--gold-deep)" }}>
                  RUT o Correo Electrónico
                </label>
                <div className="relative">
                  <Mail aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--gold-deep)" }} />
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="12345678-9 o tu@correo.com"
                    required
                    aria-invalid={Boolean(error)}
                    autoComplete="username"
                    className="w-full rounded-xl border bg-white px-4 py-3 pl-11 text-sm transition-all outline-none focus:border-[var(--gold)] focus:shadow-[var(--ring-focus)]"
                    style={{ borderColor: "#D9CFB1", color: "#1A1A1F" }}
                  />
                </div>
                <p className="text-[10px]" style={{ color: "#7A6E45" }}>
                  Los clientes ingresan con su RUT y la clave que recibieron por WhatsApp.
                </p>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="block text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: "var(--gold-deep)" }}>
                  Contraseña
                </label>
                <div className="relative">
                  <Lock aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--gold-deep)" }} />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    aria-invalid={Boolean(error)}
                    autoComplete="current-password"
                    className="w-full rounded-xl border bg-white px-4 py-3 pl-11 pr-11 text-sm transition-all outline-none focus:border-[var(--gold)] focus:shadow-[var(--ring-focus)]"
                    style={{ borderColor: "#D9CFB1", color: "#1A1A1F" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    aria-pressed={showPassword}
                    disabled={loading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 transition-colors hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--gold-deep)" }}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p
                  className="rounded-xl border px-4 py-3 text-sm"
                  style={{ background: "var(--red-dim)", borderColor: "var(--red-border)", color: "var(--red)" }}
                  role="alert"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group relative inline-flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-xs font-bold uppercase tracking-[0.28em] text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
                  boxShadow: "0 14px 26px -10px rgba(38,35,92,0.55), 0 1px 0 rgba(255,255,255,0.4) inset",
                }}
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    Ingresando…
                  </>
                ) : (
                  <>
                    Ingresar al Despacho
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </div>

            {SHOW_DEMO && (
              <div className="mt-6 rounded-xl border border-dashed p-4" style={{ borderColor: "var(--gold)", background: "rgba(201,168,76,0.05)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4" style={{ color: "var(--gold-deep)" }} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: "var(--gold-deep)" }}>Demo cliente</span>
                </div>
                <div className="text-xs mb-3 space-y-0.5 font-mono" style={{ color: "#1A1A1F" }}>
                  <p>{DEMO_CLIENT.email}</p>
                  <p>{DEMO_CLIENT.password}</p>
                </div>
                <button
                  type="button"
                  onClick={useDemo}
                  disabled={loading}
                  className="w-full py-2 rounded-md text-[10px] font-semibold uppercase tracking-[0.28em] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: "rgba(201,168,76,0.15)", color: "var(--gold-deep)", border: "1px solid rgba(201,168,76,0.4)" }}
                >
                  {loading ? "Entrando…" : "Usar credenciales demo"}
                </button>
              </div>
            )}

            <div className="my-8 flex items-center gap-3">
              <span className="h-px flex-1" style={{ background: "#E2DBC4" }} />
              <span className="text-[9px] font-semibold uppercase tracking-[0.32em]" style={{ color: "var(--gold-deep)" }}>
                ó
              </span>
              <span className="h-px flex-1" style={{ background: "#E2DBC4" }} />
            </div>

            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-xs" style={{ color: "var(--gold-deep)" }}>
                ¿Aún no eres parte de la firma?{" "}
                <Link href="/registro" className="font-semibold transition-colors hover:opacity-80" style={{ color: "var(--gold-deep)" }}>
                  Solicita una asesoría
                </Link>
              </p>
              <Link
                href="/login/equipo"
                className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.28em] transition-all hover:bg-[var(--surface-2)]"
                style={{ borderColor: "#D9CFB1", color: "var(--gold-deep)" }}
              >
                <Briefcase className="h-3.5 w-3.5" />
                Acceso del Equipo Interno
              </Link>
            </div>

            <p className="mt-7 text-center text-[9px] uppercase tracking-[0.32em]" style={{ color: "var(--gold-deep)" }}>
              Conexión protegida · Cumple ISO 27001
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
