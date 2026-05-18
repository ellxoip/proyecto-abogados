"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { EstadoContrato } from "@prisma/client";

type ContratoData = {
  id: number;
  tipo_servicio: string;
  fecha_contrato: Date | string;
  monto_ccto: number;
  cantidad_cuotas_original: number;
  observaciones: string | null;
  estado: EstadoContrato;
};

export function EditarContratoModal({ contrato, compact = false }: { contrato: ContratoData; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => dialogRef.current?.showModal());
    }
  }, [open]);

  function closeModal() {
    setOpen(false);
    dialogRef.current?.close();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const body = {
          tipo_servicio: fd.get("tipo_servicio"),
          fecha_contrato: fd.get("fecha_contrato"),
          monto_ccto: Number(fd.get("monto_ccto")),
          cantidad_cuotas_original: Number(fd.get("cantidad_cuotas_original")),
          observaciones: fd.get("observaciones") || null,
          estado: fd.get("estado"),
        };

        const res = await fetch(`/api/contratos/${contrato.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Error al actualizar");
          return;
        }

        setSuccess(true);
        router.refresh();
        setTimeout(() => closeModal(), 800);
      } catch {
        setError("Error de conexión");
      }
    });
  }

  const inputClass =
    "w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  const fechaStr =
    typeof contrato.fecha_contrato === "string"
      ? contrato.fecha_contrato.slice(0, 10)
      : contrato.fecha_contrato.toISOString().slice(0, 10);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={compact
          ? "rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          : "inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"}
      >
        Editar
      </button>

      {open && (
        <dialog
          ref={dialogRef}
          onClose={closeModal}
          className="m-auto w-full max-w-lg rounded-xl border border-[var(--border)] bg-white p-0 shadow-xl backdrop:bg-black/40"
        >
          <form onSubmit={handleSubmit}>
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="text-lg font-semibold">Editar contrato #{contrato.id}</h2>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div>
                <label className="mb-1 block text-sm font-medium">Tipo de servicio *</label>
                <input
                  name="tipo_servicio"
                  required
                  defaultValue={contrato.tipo_servicio}
                  className={inputClass}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Fecha contrato *</label>
                  <input
                    name="fecha_contrato"
                    type="date"
                    required
                    defaultValue={fechaStr}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Estado *</label>
                  <select name="estado" required defaultValue={contrato.estado} className={inputClass}>
                    {Object.values(EstadoContrato).map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Honorarios totales *</label>
                  <input
                    name="monto_ccto"
                    type="number"
                    required
                    min="1"
                    step="1"
                    defaultValue={contrato.monto_ccto}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Cantidad de cuotas *</label>
                  <input
                    name="cantidad_cuotas_original"
                    type="number"
                    required
                    min="1"
                    max="120"
                    defaultValue={contrato.cantidad_cuotas_original}
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-[var(--muted)]">Modifica el registro; no regenera cuotas.</p>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Observaciones</label>
                <textarea
                  name="observaciones"
                  rows={3}
                  defaultValue={contrato.observaciones ?? ""}
                  className={inputClass}
                  placeholder="Notas adicionales..."
                />
              </div>

              {error && (
                <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
              )}
              {success && (
                <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-600">Guardado correctamente</p>
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
                {pending ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
