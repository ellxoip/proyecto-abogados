"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Contacto = {
  id: number;
  nombre: string;
  email: string | null;
  telefono: string | null;
  cargo: string | null;
  es_principal: boolean;
};

const inp = "w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

export function ContactosSection({ clienteId, initial }: { clienteId: number; initial: Contacto[] }) {
  const [contactos, setContactos] = useState<Contacto[]>(initial);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/clientes/${clienteId}/contactos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre: fd.get("nombre"),
            email: fd.get("email") || null,
            telefono: fd.get("telefono") || null,
            cargo: fd.get("cargo") || null,
            es_principal: fd.get("es_principal") === "on",
          }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? "Error"); return; }
        form.reset();
        setShowForm(false);
        router.refresh();
        // optimistic update
        setContactos((prev) => [
          ...prev,
          {
            id: json.id,
            nombre: String(fd.get("nombre")),
            email: (fd.get("email") as string) || null,
            telefono: (fd.get("telefono") as string) || null,
            cargo: (fd.get("cargo") as string) || null,
            es_principal: fd.get("es_principal") === "on",
          },
        ]);
      } catch {
        setError("Error de conexión");
      }
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await fetch(`/api/clientes/${clienteId}/contactos/${id}`, { method: "DELETE" });
      setContactos((prev) => prev.filter((c) => c.id !== id));
      router.refresh();
    });
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Contactos</h3>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          + Agregar
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="rounded-lg border border-[var(--border)] bg-slate-50 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">Nombre *</label>
              <input name="nombre" required placeholder="Juan Pérez" className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Cargo</label>
              <input name="cargo" placeholder="Gerente financiero" className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Email</label>
              <input name="email" type="email" placeholder="juan@empresa.cl" className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Teléfono</label>
              <input name="telefono" placeholder="+56 9 1234 5678" className={inp} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="es_principal" />
            Contacto principal
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {pending ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {contactos.length > 0 ? (
        <div className="divide-y divide-[var(--border)]">
          {contactos.map((c) => (
            <div key={c.id} className="flex items-start justify-between py-3">
              <div>
                <p className="text-sm font-medium">
                  {c.nombre}
                  {c.es_principal && (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Principal
                    </span>
                  )}
                </p>
                {c.cargo && <p className="text-xs text-[var(--muted)]">{c.cargo}</p>}
                <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                  {c.email && <span>{c.email}</span>}
                  {c.telefono && <span>{c.telefono}</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(c.id)}
                disabled={pending}
                className="ml-4 text-xs text-rose-500 hover:underline disabled:opacity-40"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">Sin contactos registrados</p>
      )}
    </div>
  );
}
