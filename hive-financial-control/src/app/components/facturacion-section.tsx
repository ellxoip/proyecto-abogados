"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type FacturacionData = {
  id: number;
  rut_facturacion: string;
  razon_social_facturacion: string;
  giro_facturacion: string | null;
  direccion_facturacion: string | null;
  comuna: string | null;
  ciudad: string | null;
  email_facturacion: string | null;
  tipo_documento_preferido: string | null;
} | null;

const inp = "w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

export function FacturacionSection({ clienteId, initial }: { clienteId: number; initial: FacturacionData }) {
  const [datos, setDatos] = useState<FacturacionData>(initial);
  const [editing, setEditing] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const body = {
          rut_facturacion: fd.get("rut_facturacion"),
          razon_social_facturacion: fd.get("razon_social_facturacion"),
          giro_facturacion: fd.get("giro_facturacion") || null,
          direccion_facturacion: fd.get("direccion_facturacion") || null,
          comuna: fd.get("comuna") || null,
          ciudad: fd.get("ciudad") || null,
          email_facturacion: fd.get("email_facturacion") || null,
          tipo_documento_preferido: fd.get("tipo_documento_preferido") || null,
        };

        const res = await fetch(`/api/clientes/${clienteId}/facturacion`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? "Error"); return; }

        setDatos({ id: json.id, ...body } as FacturacionData);
        setEditing(false);
        router.refresh();
      } catch {
        setError("Error de conexión");
      }
    });
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Datos de facturación</h3>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {datos ? "Editar" : "Agregar"}
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">RUT facturación *</label>
              <input name="rut_facturacion" required defaultValue={datos?.rut_facturacion ?? ""} placeholder="76.123.456-7" className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Razón social *</label>
              <input name="razon_social_facturacion" required defaultValue={datos?.razon_social_facturacion ?? ""} placeholder="Empresa SPA" className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Giro</label>
              <input name="giro_facturacion" defaultValue={datos?.giro_facturacion ?? ""} placeholder="Servicios jurídicos" className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Email facturación</label>
              <input name="email_facturacion" type="email" defaultValue={datos?.email_facturacion ?? ""} placeholder="factura@empresa.cl" className={inp} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium">Dirección</label>
              <input name="direccion_facturacion" defaultValue={datos?.direccion_facturacion ?? ""} placeholder="Av. Providencia 123" className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Comuna</label>
              <input name="comuna" defaultValue={datos?.comuna ?? ""} className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Ciudad</label>
              <input name="ciudad" defaultValue={datos?.ciudad ?? ""} className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Tipo documento preferido</label>
              <select name="tipo_documento_preferido" defaultValue={datos?.tipo_documento_preferido ?? ""} className={inp}>
                <option value="">Sin preferencia</option>
                <option value="BOLETA">Boleta</option>
                <option value="FACTURA_EXENTA">Factura exenta</option>
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {pending ? "Guardando..." : "Guardar"}
            </button>
            {datos && (
              <button type="button" onClick={() => setEditing(false)} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm">
                Cancelar
              </button>
            )}
          </div>
        </form>
      ) : datos ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-[var(--muted)]">RUT</dt><dd className="font-medium">{datos.rut_facturacion}</dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Razón social</dt><dd>{datos.razon_social_facturacion}</dd></div>
          {datos.giro_facturacion && <div><dt className="text-xs text-[var(--muted)]">Giro</dt><dd>{datos.giro_facturacion}</dd></div>}
          {datos.email_facturacion && <div><dt className="text-xs text-[var(--muted)]">Email</dt><dd>{datos.email_facturacion}</dd></div>}
          {datos.direccion_facturacion && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-[var(--muted)]">Dirección</dt>
              <dd>{datos.direccion_facturacion}{datos.comuna ? `, ${datos.comuna}` : ""}{datos.ciudad ? `, ${datos.ciudad}` : ""}</dd>
            </div>
          )}
          {datos.tipo_documento_preferido && <div><dt className="text-xs text-[var(--muted)]">Documento preferido</dt><dd>{datos.tipo_documento_preferido}</dd></div>}
        </dl>
      ) : (
        <p className="text-sm text-[var(--muted)]">Sin datos de facturación registrados</p>
      )}
    </div>
  );
}
