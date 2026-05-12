"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { registerAndOpenCase, type RegisterInput } from "./actions";

type Props = { categories: { id: string; name: string }[] };

const FIELD_LABEL = "block text-[11px] text-[var(--text-muted)] uppercase tracking-widest";
const FIELD_INPUT =
  "w-full bg-[var(--bg)] border border-[var(--border-subtle)] text-[var(--text)] rounded px-4 py-3 text-sm outline-none focus:border-[var(--gold)] transition-colors placeholder:text-[var(--text-muted)] disabled:opacity-50";

export function RegisterForm({ categories }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; field?: keyof RegisterInput } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState<RegisterInput>({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    categoryId: categories[0]?.id ?? "",
    description: "",
  });

  function set<K extends keyof RegisterInput>(key: K, value: RegisterInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (error?.field === key) setError(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    startTransition(async () => {
      const res = await registerAndOpenCase(form);
      if (!res.ok) {
        setError({ message: res.reason, field: res.field });
        setPending(false);
        return;
      }

      setSuccess(`Caso ${res.caseCode} creado. Ingresándote al portal…`);

      const signInRes = await signIn("credentials", {
        email: res.email,
        password: form.password,
        redirect: false,
      });

      setPending(false);

      if (signInRes?.error) {
        setError({ message: "Cuenta creada, pero el ingreso automático falló. Inicia sesión manualmente." });
        return;
      }
      router.push("/portal");
      router.refresh();
    });
  }

  if (success) {
    return (
      <div className="p-6 rounded bg-[#10B98115] border border-[#10B98140] flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-[#34D399] mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#34D399] mb-1">
            Solicitud recibida
          </p>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">{success}</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <label className={FIELD_LABEL}>Nombre completo</label>
        <input
          type="text"
          value={form.fullName}
          onChange={(e) => set("fullName", e.target.value)}
          required
          minLength={3}
          disabled={pending}
          className={FIELD_INPUT}
          placeholder="Tu nombre y apellidos"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className={FIELD_LABEL}>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            required
            disabled={pending}
            className={FIELD_INPUT}
            placeholder="tu@correo.com"
          />
        </div>
        <div className="space-y-2">
          <label className={FIELD_LABEL}>Teléfono</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            required
            disabled={pending}
            className={FIELD_INPUT}
            placeholder="+56912345678"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className={FIELD_LABEL}>Contraseña (mín. 8 caracteres)</label>
        <input
          type="password"
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
          required
          minLength={8}
          disabled={pending}
          className={FIELD_INPUT}
          placeholder="••••••••"
        />
      </div>

      <div className="space-y-2">
        <label className={FIELD_LABEL}>Materia legal</label>
        <select
          value={form.categoryId}
          onChange={(e) => set("categoryId", e.target.value)}
          required
          disabled={pending || categories.length === 0}
          className={FIELD_INPUT}
        >
          {categories.length === 0 ? (
            <option value="">No hay materias disponibles</option>
          ) : (
            categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))
          )}
        </select>
      </div>

      <div className="space-y-2">
        <label className={FIELD_LABEL}>Describe tu caso</label>
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          required
          minLength={20}
          maxLength={2000}
          rows={4}
          disabled={pending}
          className={FIELD_INPUT}
          placeholder="Cuéntanos brevemente qué necesitas resolver."
        />
        <p className="text-[10px] text-[var(--text-muted)]">{form.description.length} / 2000</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-[#F87171] bg-[#F8717110] border border-[#F8717130] rounded p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="text-xs">{error.message}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={pending || categories.length === 0}
        className="w-full bg-[var(--gold)] text-[var(--text)] font-semibold text-xs uppercase tracking-widest rounded py-3.5 disabled:opacity-50 hover:bg-[#D4B85C] transition-colors flex items-center justify-center gap-2"
      >
        {pending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Creando tu caso…
          </>
        ) : (
          "Enviar Solicitud de Asesoría"
        )}
      </button>
    </form>
  );
}
