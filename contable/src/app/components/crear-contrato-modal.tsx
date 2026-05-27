"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";

export function CrearContratoModal({ clienteId }: { clienteId: number }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  function openModal() {
    setError(null);
    setOpen(true);
    requestAnimationFrame(() => dialogRef.current?.showModal());
  }

  function closeModal() {
    setOpen(false);
    dialogRef.current?.close();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);

    startTransition(async () => {
      try {
        const body = {
          cliente_id: clienteId,
          tipo_servicio: fd.get("tipo_servicio"),
          fecha_contrato: fd.get("fecha_contrato"),
          monto_ccto: Number(fd.get("monto_ccto")),
          monto_pago_inicial: Number(fd.get("monto_pago_inicial")),
          cantidad_cuotas: Number(fd.get("cantidad_cuotas")),
          fecha_primera_cuota: fd.get("fecha_primera_cuota"),
          observaciones: fd.get("observaciones") || null,
        };

        const res = await fetch("/api/contratos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Error al crear contrato");
          return;
        }

        closeModal();
        router.refresh();
        router.push(`/cuotas/${json.id}`);
      } catch {
        setError("Error de conexión");
      }
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const inp = "w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        + Nuevo contrato
      </button>

      {open && (
        <dialog
          ref={dialogRef}
          onClose={closeModal}
          className="m-auto w-full max-w-lg rounded-xl border border-[var(--border)] bg-white p-0 shadow-xl backdrop:bg-black/40"
        >
          <form onSubmit={handleSubmit}>
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="text-lg font-semibold">Nuevo contrato</h2>
              <p className="text-sm text-[var(--muted)]">Alta manual de contrato y cuotas</p>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div>
                <label className="mb-1 block text-sm font-medium">Tipo de servicio *</label>
                <input name="tipo_servicio" required placeholder="Ej: Defensa tributaria" className={inp} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Fecha del contrato *</label>
                  <input name="fecha_contrato" type="date" required defaultValue={today} className={inp} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Fecha primera cuota *</label>
                  <input name="fecha_primera_cuota" type="date" required defaultValue={today} className={inp} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Honorarios totales *</label>
                  <input name="monto_ccto" type="number" required min="1" step="1" placeholder="1500000" className={inp} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Pago inicial *</label>
                  <input name="monto_pago_inicial" type="number" required min="0" step="1" placeholder="300000" className={inp} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Cantidad de cuotas *</label>
                <input name="cantidad_cuotas" type="number" required min="1" max="120" defaultValue="1" className={inp} />
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Cuota 1 = pago inicial. Cuotas 2..N = saldo dividido mensualmente.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Observaciones</label>
                <textarea name="observaciones" rows={2} className={inp} placeholder="Notas opcionales..." />
              </div>

              {error && (
                <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
              <button
                type="button"
                onClick={closeModal}
                disabled={pending}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {pending ? "Creando..." : "Crear contrato"}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
