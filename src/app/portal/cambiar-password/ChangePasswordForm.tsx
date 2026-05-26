"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { KeyRound, ShieldCheck, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff } from "lucide-react";
import { changeOwnPassword } from "./actions";

const SEQUENTIAL_PATTERNS = ["012345", "123456", "234567", "345678", "456789", "abcdef", "bcdefg", "qwerty"];

function getPasswordHints(password: string) {
  const hints: string[] = [];
  if (password.length < 8) hints.push("Minimo 8 caracteres.");
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) hints.push("Incluye letras y numeros.");
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) hints.push("Mezcla mayusculas y minusculas.");
  if (new Set(password.toLowerCase()).size < 5) hints.push("Evita repetir caracteres.");
  if (SEQUENTIAL_PATTERNS.some((pattern) => password.toLowerCase().includes(pattern))) {
    hints.push("Evita secuencias obvias.");
  }
  return hints;
}

function isStrongEnough(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

export default function ChangePasswordForm() {
  const router = useRouter();
  const { update } = useSession();
  const [isPending, startTransition] = useTransition();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState({ current: false, next: false, confirm: false });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const hints = useMemo(() => getPasswordHints(newPassword), [newPassword]);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const sameAsCurrent = currentPassword.length > 0 && currentPassword === newPassword;
  const formValid = currentPassword.length > 0 && isStrongEnough(newPassword) && passwordsMatch && !sameAsCurrent;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formValid) {
      setError("Revisa los campos marcados antes de guardar la nueva contrasena.");
      return;
    }

    startTransition(async () => {
      const result = await changeOwnPassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      await update({ mustChangePassword: false });
      setSuccess("Contrasena actualizada y sincronizada con PagaCuotas.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      router.refresh();
    });
  }

  return (
    <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-4">
      <div
        className="w-full max-w-md rounded-lg p-8 shadow-2xl"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--gold-border)",
          borderLeft: "3px solid var(--gold)",
        }}
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2.5 rounded-md" style={{ background: "var(--surface-2)" }}>
            <KeyRound className="w-5 h-5" style={{ color: "var(--gold)" }} />
          </div>
          <div>
            <h1
              className="text-xl font-bold"
              style={{ color: "var(--text)", fontFamily: "'Playfair Display', serif" }}
            >
              Cambiar contrasena
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Actualiza tu clave personal para PagaCuotas y el Portal Legal
            </p>
          </div>
        </div>

        <div
          className="mt-4 mb-5 px-3 py-2.5 rounded-md text-xs flex gap-2"
          style={{
            background: "rgba(201,168,76,0.08)",
            border: "1px solid rgba(201,168,76,0.2)",
            color: "var(--gold)",
          }}
        >
          <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            La nueva contrasena queda activa tanto en este portal como en PagaCuotas.
            Tu clave anterior deja de funcionar de inmediato.
          </span>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <PasswordField
            name="currentPassword"
            label="Contrasena actual"
            placeholder="Tu clave vigente"
            value={currentPassword}
            visible={visible.current}
            autoComplete="current-password"
            invalid={false}
            disabled={isPending}
            onChange={(value) => {
              setCurrentPassword(value);
              if (error) setError(null);
            }}
            onToggle={() => setVisible((state) => ({ ...state, current: !state.current }))}
          />
          <PasswordField
            name="newPassword"
            label="Nueva contrasena"
            placeholder="Minimo 8 caracteres, con letras y numeros"
            value={newPassword}
            visible={visible.next}
            autoComplete="new-password"
            invalid={newPassword.length > 0 && !isStrongEnough(newPassword)}
            disabled={isPending}
            minLength={8}
            onChange={(value) => {
              setNewPassword(value);
              if (error) setError(null);
            }}
            onToggle={() => setVisible((state) => ({ ...state, next: !state.next }))}
          />

          {newPassword.length > 0 && (
            <div className="rounded-md px-3 py-2 text-[11px]" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
              {hints.length > 0 ? (
                <ul className="space-y-1">
                  {hints.map((hint) => (
                    <li key={hint} className="flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-[#F59E0B]" />
                      {hint}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="flex items-center gap-1.5 font-semibold text-[#34D399]">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Cumple la politica minima de seguridad.
                </span>
              )}
            </div>
          )}

          <PasswordField
            name="confirmPassword"
            label="Repite la nueva contrasena"
            placeholder="Debe coincidir"
            value={confirmPassword}
            visible={visible.confirm}
            autoComplete="new-password"
            invalid={confirmPassword.length > 0 && !passwordsMatch}
            disabled={isPending}
            minLength={8}
            onChange={(value) => {
              setConfirmPassword(value);
              if (error) setError(null);
            }}
            onToggle={() => setVisible((state) => ({ ...state, confirm: !state.confirm }))}
          />

          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-[11px] font-semibold text-[#e26d76]">La confirmacion no coincide.</p>
          )}

          {sameAsCurrent && (
            <p className="text-[11px] font-semibold text-[#e26d76]">
              La nueva contrasena debe ser distinta a la actual.
            </p>
          )}

          {error && (
            <StatusMessage tone="error">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </StatusMessage>
          )}

          {success && (
            <StatusMessage tone="success">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{success}</span>
            </StatusMessage>
          )}

          <button
            type="submit"
            disabled={isPending || !formValid}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-bold uppercase tracking-widest transition-all disabled:opacity-50"
            style={{
              background: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
              border: "1px solid var(--gold-border)",
              color: "#FFFFFF",
            }}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Guardando...
              </>
            ) : (
              "Guardar nueva contrasena"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function PasswordField({
  name,
  label,
  placeholder,
  value,
  visible,
  autoComplete,
  invalid,
  disabled,
  minLength,
  onChange,
  onToggle,
}: {
  name: string;
  label: string;
  placeholder?: string;
  value: string;
  visible: boolean;
  autoComplete?: string;
  invalid: boolean;
  disabled: boolean;
  minLength?: number;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          name={name}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          aria-invalid={invalid}
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full px-3 py-2.5 pr-11 rounded-md text-sm outline-none transition-colors disabled:opacity-60"
          style={{
            background: "var(--surface-2)",
            border: invalid ? "1px solid rgba(220,53,69,0.55)" : "1px solid var(--border-glass)",
            color: "var(--text)",
          }}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? `Ocultar ${label}` : `Mostrar ${label}`}
          aria-pressed={visible}
          disabled={disabled}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 transition-colors disabled:opacity-50"
          style={{ color: "var(--text-muted)" }}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}

function StatusMessage({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const isError = tone === "error";
  return (
    <div
      className="flex items-start gap-2 px-3 py-2 rounded-md text-xs"
      style={{
        background: isError ? "rgba(220,53,69,0.08)" : "rgba(52,211,153,0.1)",
        border: isError ? "1px solid rgba(220,53,69,0.25)" : "1px solid rgba(52,211,153,0.25)",
        color: isError ? "#e26d76" : "#34D399",
      }}
    >
      {children}
    </div>
  );
}
