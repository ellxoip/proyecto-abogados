"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

const inp = "w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

export function NuevoCompromisoModal() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) requestAnimationFrame(() => dialogRef.current?.showModal());
  }, [open]);

  function closeModal() {
    setOpen(false);
    dialogRef.current?.close();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const res = await fetch("/api/compromisos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cliente_id: Number(fd.get("cliente_id")),
            contrato_id: Number(fd.get("contrato_id")),
            cuota_id: fd.get("cuota_id") ? Number(fd.get("cuota_id")) : null,
            fecha_compromiso: fd.get("fecha_compromiso"),
            monto_comprometido: Number(fd.get("monto_comprometido")),
            notas: fd.get("notas") || null,
          }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? "Error"); return; }
        closeModal();
        router.refresh();
      } catch {
        setError("Error de conexión");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        + Nuevo compromiso
      </button>

      {open && (
        <dialog
          ref={dialogRef}
          onClose={closeModal}
          className="m-auto w-full max-w-lg rounded-xl border border-[var(--border)] bg-white p-0 shadow-xl backdrop:bg-black/40"
        >
          <form onSubmit={handleSubmit}>
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="text-lg font-semibold">Nuevo compromiso de pago</h2>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">ID Cliente *</label>
                  <input name="cliente_id" type="number" required min={1} placeholder="Ej: 12" className={inp} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">ID Contrato *</label>
                  <input name="contrato_id" type="number" required min={1} placeholder="Ej: 5" className={inp} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Fecha compromiso *</label>
                  <input name="fecha_compromiso" type="date" required className={inp} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Monto comprometido *</label>
                  <input name="monto_comprometido" type="number" required min={1} step="0.01" placeholder="100000" className={inp} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">ID Cuota (opcional)</label>
                <input name="cuota_id" type="number" min={1} placeholder="Dejar vacío si aplica a todo el contrato" className={inp} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Notas</label>
                <textarea name="notas" rows={2} placeholder="Detalles del acuerdo..." className={inp} />
              </div>
              {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
              <button type="button" onClick={closeModal} disabled={pending} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-50">
                Cancelar
              </button>
              <button type="submit" disabled={pending} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {pending ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
