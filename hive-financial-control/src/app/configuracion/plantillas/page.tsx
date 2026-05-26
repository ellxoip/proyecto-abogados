"use client";

import Link from "next/link";
import { useState } from "react";

type Plantilla = {
  id: string;
  nombre: string;
  tipo: "CONTRATO" | "ESTADO_CUENTA" | "FACTURA";
  descripcion: string;
  variables: string[];
};

const PLANTILLAS_DEFAULT: Plantilla[] = [
  {
    id: "contrato",
    nombre: "Contrato de servicios",
    tipo: "CONTRATO",
    descripcion: "Plantilla base para contrato con cliente",
    variables: ["{{nombre_cliente}}", "{{rut_cliente}}", "{{tipo_servicio}}", "{{monto_total}}", "{{fecha_contrato}}", "{{cantidad_cuotas}}"],
  },
  {
    id: "estado_cuenta",
    nombre: "Estado de cuenta",
    tipo: "ESTADO_CUENTA",
    descripcion: "Resumen de cuotas y pagos del cliente",
    variables: ["{{nombre_cliente}}", "{{rut_cliente}}", "{{total_deuda}}", "{{cuotas_vencidas}}", "{{proximo_vencimiento}}"],
  },
  {
    id: "factura",
    nombre: "Factura / boleta",
    tipo: "FACTURA",
    descripcion: "Documento tributario con logo y datos empresa",
    variables: ["{{razon_social}}", "{{rut_empresa}}", "{{nombre_cliente}}", "{{detalle_servicio}}", "{{monto_neto}}", "{{iva}}", "{{total}}"],
  },
];

export default function PlantillasPage() {
  const [selected, setSelected] = useState<Plantilla | null>(null);

  return (
    <section className="space-y-6">
      <header>
        <Link href="/configuracion" className="text-xs text-[var(--muted)] hover:underline">← Configuración</Link>
        <h2 className="mt-1 text-2xl font-semibold">Plantillas de documentos</h2>
        <p className="text-sm text-[var(--muted)]">Plantillas para generar PDFs con campos dinámicos</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {PLANTILLAS_DEFAULT.map(p => (
          <button key={p.id} onClick={() => setSelected(selected?.id === p.id ? null : p)}
            className={`card p-5 text-left transition-all ${selected?.id === p.id ? "border-2 border-[var(--accent)]" : "hover:shadow-md"}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{p.tipo === "CONTRATO" ? "📄" : p.tipo === "ESTADO_CUENTA" ? "📊" : "🧾"}</span>
              <div>
                <p className="font-semibold text-sm">{p.nombre}</p>
                <p className="text-xs text-[var(--muted)]">{p.tipo.replace(/_/g, " ")}</p>
              </div>
            </div>
            <p className="text-xs text-[var(--muted)]">{p.descripcion}</p>
          </button>
        ))}
      </div>

      {selected && (
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold">{selected.nombre}</h3>
          <div>
            <p className="text-xs font-medium text-[var(--muted)] mb-2">Variables disponibles</p>
            <div className="flex flex-wrap gap-2">
              {selected.variables.map(v => (
                <code key={v} className="bg-slate-100 rounded px-2 py-1 text-xs">{v}</code>
              ))}
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg p-4 border border-[var(--border)]">
            <p className="text-xs text-[var(--muted)] mb-2">Vista previa (texto)</p>
            <div className="text-sm space-y-1 text-[var(--muted)]">
              {selected.tipo === "CONTRATO" && (
                <>
                  <p>En Santiago, a {"{{fecha_contrato}}"}, entre el estudio y {"{{nombre_cliente}}"}</p>
                  <p>RUT {"{{rut_cliente}}"}, se acuerda la prestación de servicios de {"{{tipo_servicio}}"}.</p>
                  <p>Monto total: {"{{monto_total}}"} en {"{{cantidad_cuotas}}"} cuotas.</p>
                </>
              )}
              {selected.tipo === "ESTADO_CUENTA" && (
                <>
                  <p>Estado de cuenta al día de hoy</p>
                  <p>Cliente: {"{{nombre_cliente}}"} — RUT: {"{{rut_cliente}}"}</p>
                  <p>Deuda total: {"{{total_deuda}}"} | Cuotas vencidas: {"{{cuotas_vencidas}}"}</p>
                  <p>Próximo vencimiento: {"{{proximo_vencimiento}}"}</p>
                </>
              )}
              {selected.tipo === "FACTURA" && (
                <>
                  <p>{"{{razon_social}}"} — RUT {"{{rut_empresa}}"}</p>
                  <p>A: {"{{nombre_cliente}}"}</p>
                  <p>Servicio: {"{{detalle_servicio}}"}</p>
                  <p>Neto: {"{{monto_neto}}"} | IVA: {"{{iva}}"} | Total: {"{{total}}"}</p>
                </>
              )}
            </div>
          </div>
          <div className="bg-amber-50 rounded-lg p-3">
            <p className="text-xs text-amber-700">Las plantillas PDF se generarán con los datos reales del sistema. Esta vista es solo referencial.</p>
          </div>
        </div>
      )}
    </section>
  );
}
