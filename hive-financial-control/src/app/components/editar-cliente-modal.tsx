"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { EstadoCliente, TipoCliente } from "@prisma/client";

type ClienteData = {
  id: number;
  nombre: string;
  tipo_cliente: TipoCliente;
  email: string | null;
  telefono: string | null;
  estado: EstadoCliente;
  fecha_ingreso: Date | string;
};

export function EditarClienteModal({ cliente }: { cliente: ClienteData }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

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
    setSuccess(false);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/clientes/${cliente.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre: fd.get("nombre"),
            tipo_cliente: fd.get("tipo_cliente"),
            email: fd.get("email") || null,
            telefono: fd.get("telefono") || null,
            estado: fd.get("estado"),
            fecha_ingreso: fd.get("fecha_ingreso"),
          }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? "Error al actualizar"); return; }
        setSuccess(true);
        router.refresh();
        setTimeout(() => closeModal(), 800);
      } catch {
        setError("Error de conexión");
      }
    });
  }

  const inp = "w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";
  const fechaStr = typeof cliente.fecha_ingreso === "string"
    ? cliente.fecha_ingreso.slice(0, 10)
    : new Date(cliente.fecha_ingreso).toISOString().slice(0, 10);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Editar cliente
      </button>

      {open && (
        <dialog
          ref={dialogRef}
          onClose={closeModal}
          className="m-auto w-full max-w-lg rounded-xl border border-[var(--border)] bg-white p-0 shadow-xl backdrop:bg-black/40"
        >
          <form onSubmit={handleSubmit}>
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="text-lg font-semibold">Editar cliente</h2>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div>
                <label className="mb-1 block text-sm font-medium">Nombre / Razón social *</label>
                <input name="nombre" required defaultValue={cliente.nombre} className={inp} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Tipo *</label>
                  <select name="tipo_cliente" required defaultValue={cliente.tipo_cliente} className={inp}>
                    <option value={TipoCliente.PERSONA}>Persona</option>
                    <option value={TipoCliente.EMPRESA}>Empresa</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Estado *</label>
                  <select name="estado" required defaultValue={cliente.estado} className={inp}>
                    {Object.values(EstadoCliente).map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Email</label>
                  <input name="email" type="email" defaultValue={cliente.email ?? ""} className={inp} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Teléfono</label>
                  <input name="telefono" defaultValue={cliente.telefono ?? ""} className={inp} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Fecha de ingreso *</label>
                <input name="fecha_ingreso" type="date" required defaultValue={fechaStr} className={inp} />
              </div>

              {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
              {success && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-600">Guardado correctamente</p>}
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
              <button type="button" onClick={closeModal} disabled={pending} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-50">
                Cancelar
              </button>
              <button type="submit" disabled={pending} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {pending ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
