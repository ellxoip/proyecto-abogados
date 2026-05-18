"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";

export function CrearClienteModal() {
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
    const form = e.currentTarget;
    const fd = new FormData(form);

    startTransition(async () => {
      try {
        const body = {
          rut: fd.get("rut"),
          nombre: fd.get("nombre"),
          tipo_cliente: fd.get("tipo_cliente"),
          email: fd.get("email") || null,
          telefono: fd.get("telefono") || null,
          fecha_ingreso: fd.get("fecha_ingreso"),
        };

        const res = await fetch("/api/clientes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Error al crear cliente");
          return;
        }

        closeModal();
        router.refresh();
        router.push(`/clientes/${json.id}`);
      } catch {
        setError("Error de conexión");
      }
    });
  }

  const inputClass =
    "w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        + Nuevo cliente
      </button>

      {open && (
        <dialog
          ref={dialogRef}
          onClose={closeModal}
          className="m-auto w-full max-w-lg rounded-xl border border-[var(--border)] bg-white p-0 shadow-xl backdrop:bg-black/40"
        >
          <form onSubmit={handleSubmit}>
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="text-lg font-semibold">Nuevo cliente</h2>
              <p className="text-sm text-[var(--muted)]">Alta manual sin lead de CRM</p>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">RUT *</label>
                  <input name="rut" required placeholder="12.345.678-9" className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Tipo *</label>
                  <select name="tipo_cliente" required className={inputClass}>
                    <option value="">Seleccionar</option>
                    <option value="PERSONA">PERSONA</option>
                    <option value="EMPRESA">EMPRESA</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Nombre / Razón social *</label>
                <input name="nombre" required placeholder="Juan Pérez" className={inputClass} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Email</label>
                  <input name="email" type="email" placeholder="correo@ejemplo.cl" className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Teléfono</label>
                  <input name="telefono" placeholder="+56 9 1234 5678" className={inputClass} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Fecha de ingreso *</label>
                <input
                  name="fecha_ingreso"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className={inputClass}
                />
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
                {pending ? "Guardando..." : "Crear cliente"}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
