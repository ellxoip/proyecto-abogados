"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function MarcarNoCobrable({ cuotaId, cobrable, motivoActual }: { cuotaId: number; cobrable: boolean; motivoActual?: string | null }) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!cobrable) {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
        No cobrable{motivoActual ? `: ${motivoActual}` : ""}
      </span>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!motivo.trim()) { setError("Ingresa un motivo"); return; }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/cuota/${cuotaId}/marcar-no-cobrable`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? "Error"); return; }
        setOpen(false);
        router.refresh();
      } catch {
        setError("Error de conexión");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-slate-500 hover:text-rose-600 hover:underline"
      >
        Marcar no cobrable
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (ej: condonación)"
        maxLength={80}
        className="rounded border border-[var(--border)] px-2 py-1 text-xs w-44"
      />
      <button type="submit" disabled={pending} className="rounded bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700 disabled:opacity-50">
        {pending ? "..." : "Confirmar"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--muted)]">×</button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </form>
  );
}
