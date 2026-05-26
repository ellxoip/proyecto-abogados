"use client";

import { useState, useTransition, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { registerAndOpenCase, type RegisterInput } from "./actions";

type Props = { categories: { id: string; name: string }[] };

const FIELD_LABEL = "block text-[11px] text-[var(--text-muted)] uppercase tracking-widest";
const FIELD_INPUT =
  "w-full bg-[var(--bg)] border border-[var(--border-subtle)] text-[var(--text)] rounded px-4 py-3 text-sm outline-none focus:border-[var(--gold)] transition-colors placeholder:text-[var(--text-muted)] disabled:opacity-50";

function validatePassword(password: string, confirmPassword: string) {
  if (password.length < 8) return "La contrasena debe tener al menos 8 caracteres.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "La contrasena debe incluir letras y numeros.";
  if (password !== confirmPassword) return "La confirmacion de contrasena no coincide.";
  return null;
}

export function RegisterForm({ categories }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; field?: keyof RegisterInput } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const passwordError = validatePassword(form.password, confirmPassword);
    if (passwordError) {
      setError({ message: passwordError, field: "password" });
      return;
    }

    setPending(true);

    startTransition(async () => {
      const res = await registerAndOpenCase(form);
      if (!res.ok) {
        setError({ message: res.reason, field: res.field });
        setPending(false);
        return;
      }

      setSuccess(`Caso ${res.caseCode} creado. Ingresandote al portal...`);

      const signInRes = await signIn("credentials", {
        email: res.email,
        password: form.password,
        redirect: false,
      });

      setPending(false);

      if (signInRes?.error) {
        setError({ message: "Cuenta creada, pero el ingreso automatico fallo. Inicia sesion manualmente." });
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
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
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
            autoComplete="email"
            aria-invalid={error?.field === "email"}
            disabled={pending}
            className={FIELD_INPUT}
            placeholder="tu@correo.com"
          />
        </div>
        <div className="space-y-2">
          <label className={FIELD_LABEL}>Telefono</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            required
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={error?.field === "phone"}
            disabled={pending}
            className={FIELD_INPUT}
            placeholder="+56912345678"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className={FIELD_LABEL}>Contrasena (min. 8 caracteres)</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            aria-invalid={error?.field === "password"}
            disabled={pending}
            className={`${FIELD_INPUT} pr-11`}
            placeholder="********"
          />
          <VisibilityButton
            visible={showPassword}
            disabled={pending}
            label="contrasena"
            onClick={() => setShowPassword((visible) => !visible)}
          />
        </div>
        <p className="text-[10px] text-[var(--text-muted)]">Usa al menos una letra y un numero.</p>
      </div>

      <div className="space-y-2">
        <label className={FIELD_LABEL}>Confirmar contrasena</label>
        <div className="relative">
          <input
            type={showConfirmPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (error?.field === "password") setError(null);
            }}
            required
            minLength={8}
            autoComplete="new-password"
            aria-invalid={confirmPassword.length > 0 && confirmPassword !== form.password}
            disabled={pending}
            className={`${FIELD_INPUT} pr-11`}
            placeholder="********"
          />
          <VisibilityButton
            visible={showConfirmPassword}
            disabled={pending}
            label="confirmacion"
            onClick={() => setShowConfirmPassword((visible) => !visible)}
          />
        </div>
        {confirmPassword.length > 0 && confirmPassword !== form.password && (
          <p className="text-[10px] font-semibold text-[#F87171]">No coincide con la contrasena.</p>
        )}
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
          placeholder="Cuentanos brevemente que necesitas resolver."
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
        className="w-full bg-[var(--sidebar-bg)] text-white font-semibold text-xs uppercase tracking-widest rounded py-3.5 disabled:opacity-50 hover:bg-[var(--sidebar-deep)] transition-colors flex items-center justify-center gap-2"
      >
        {pending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Creando tu caso...
          </>
        ) : (
          "Enviar Solicitud de Asesoria"
        )}
      </button>
    </form>
  );
}

function VisibilityButton({
  visible,
  disabled,
  label,
  onClick,
}: {
  visible: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={visible ? `Ocultar ${label}` : `Mostrar ${label}`}
      aria-pressed={visible}
      disabled={disabled}
      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-50"
    >
      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}
