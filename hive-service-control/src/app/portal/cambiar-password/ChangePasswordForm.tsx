"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { KeyRound, ShieldCheck, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { changeOwnPassword } from "./actions";

export default function ChangePasswordForm() {
  const router = useRouter();
  const { update } = useSession();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const form = new FormData(e.currentTarget);
    const formEl = e.currentTarget;

    startTransition(async () => {
      const result = await changeOwnPassword({
        currentPassword: String(form.get("currentPassword") ?? ""),
        newPassword: String(form.get("newPassword") ?? ""),
        confirmPassword: String(form.get("confirmPassword") ?? ""),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      await update({ mustChangePassword: false });
      setSuccess(
        "Contraseña actualizada. Se sincronizó también con PagaCuotas; usa la nueva clave en ambos portales.",
      );
      formEl.reset();
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
              Cambiar contraseña
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
            La nueva contraseña queda activa tanto en este portal como en PagaCuotas.
            Tu clave anterior dejará de funcionar de inmediato.
          </span>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            name="currentPassword"
            label="Contraseña actual"
            placeholder="Tu clave vigente"
            autoComplete="current-password"
          />
          <Field
            name="newPassword"
            label="Nueva contraseña"
            placeholder="Mínimo 8 caracteres, con letras y números"
            autoComplete="new-password"
          />
          <Field
            name="confirmPassword"
            label="Repite la nueva contraseña"
            placeholder="Debe coincidir"
            autoComplete="new-password"
          />

          {error && (
            <div
              className="flex items-start gap-2 px-3 py-2 rounded-md text-xs"
              style={{
                background: "rgba(220,53,69,0.08)",
                border: "1px solid rgba(220,53,69,0.25)",
                color: "#e26d76",
              }}
            >
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div
              className="flex items-start gap-2 px-3 py-2 rounded-md text-xs"
              style={{
                background: "rgba(52,211,153,0.1)",
                border: "1px solid rgba(52,211,153,0.25)",
                color: "#34D399",
              }}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-bold uppercase tracking-widest transition-all disabled:opacity-50"
            style={{
              background: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
              border: "1px solid var(--gold-border)",
              color: "#FFFFFF",
            }}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Guardando…
              </>
            ) : (
              "Guardar nueva contraseña"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  name,
  label,
  placeholder,
  autoComplete,
}: {
  name: string;
  label: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input
        type="password"
        name={name}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-md text-sm outline-none transition-colors"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-glass)",
          color: "var(--text)",
        }}
      />
    </label>
  );
}
