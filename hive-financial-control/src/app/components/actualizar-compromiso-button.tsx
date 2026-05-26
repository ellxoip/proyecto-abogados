"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ActualizarCompromisoButton({ id }: { id: number }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function update(estado: "CUMPLIDO" | "INCUMPLIDO") {
    startTransition(async () => {
      await fetch(`/api/compromisos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-[var(--accent)] hover:underline"
      >
        Actualizar
      </button>
    );
  }

  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => update("CUMPLIDO")}
        disabled={pending}
        className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
      >
        Cumplido
      </button>
      <button
        type="button"
        onClick={() => update("INCUMPLIDO")}
        disabled={pending}
        className="rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-200 disabled:opacity-50"
      >
        Incumplido
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-[var(--muted)] hover:underline"
      >
        ×
      </button>
    </div>
  );
}
