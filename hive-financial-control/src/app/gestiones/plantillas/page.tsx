"use client";

import Link from "next/link";
import { useState } from "react";

type Canal = "EMAIL" | "WHATSAPP" | "SMS";

type Plantilla = {
  id: string;
  nombre: string;
  canal: Canal;
  tramo: string;
  dias_desde: number;
  dias_hasta: number;
  asunto: string;
  cuerpo: string;
};

const PLANTILLAS_DEFAULT: Plantilla[] = [
  {
    id: "prevencio",
    nombre: "Recordatorio previo al vencimiento",
    canal: "EMAIL",
    tramo: "Prevención",
    dias_desde: -3,
    dias_hasta: 0,
    asunto: "Recordatorio: su cuota vence pronto",
    cuerpo:
      "Estimado/a {{nombre_cliente}},\n\nLe recordamos que su cuota N°{{numero_cuota}} por {{monto_cuota}} vence el {{fecha_vencimiento}}.\n\nPuede pagar en: {{link_pago}}\n\nAtte. {{nombre_empresa}}",
  },
  {
    id: "mora-temprana",
    nombre: "Cuota vencida (1–10 días)",
    canal: "EMAIL",
    tramo: "Mora temprana",
    dias_desde: 1,
    dias_hasta: 10,
    asunto: "Cuota vencida — acción requerida",
    cuerpo:
      "Estimado/a {{nombre_cliente}},\n\nSu cuota por {{monto_cuota}} se encuentra vencida hace {{dias_atraso}} días (desde {{fecha_vencimiento}}).\n\nLe solicitamos regularizar su situación: {{link_pago}}\n\nAtte. {{nombre_empresa}}",
  },
  {
    id: "mora-media",
    nombre: "Mora moderada (11–30 días)",
    canal: "EMAIL",
    tramo: "Mora moderada",
    dias_desde: 11,
    dias_hasta: 30,
    asunto: "Aviso de mora — {{dias_atraso}} días de atraso",
    cuerpo:
      "Estimado/a {{nombre_cliente}},\n\nSu deuda de {{monto_total_deuda}} lleva {{dias_atraso}} días de atraso.\n\nPor favor regularice a la brevedad para evitar cargos adicionales.\n\nContacto: {{telefono_empresa}}\nPago en línea: {{link_pago}}",
  },
  {
    id: "mora-grave",
    nombre: "Mora grave (30+ días)",
    canal: "EMAIL",
    tramo: "Mora grave",
    dias_desde: 31,
    dias_hasta: 999,
    asunto: "Aviso final de cobranza",
    cuerpo:
      "Estimado/a {{nombre_cliente}},\n\nSu deuda de {{monto_total_deuda}} registra {{dias_atraso}} días de atraso.\n\nDe no regularizar en 5 días hábiles, su caso será derivado a cobranza judicial.\n\nContacte: {{telefono_empresa}}",
  },
  {
    id: "whatsapp-recordatorio",
    nombre: "WhatsApp recordatorio",
    canal: "WHATSAPP",
    tramo: "Prevención",
    dias_desde: -1,
    dias_hasta: 0,
    asunto: "",
    cuerpo:
      "Hola {{nombre_cliente}}, le recordamos que su cuota de {{monto_cuota}} vence mañana. Pague aquí: {{link_pago}}",
  },
];

const VARIABLES = [
  "{{nombre_cliente}}",
  "{{rut_cliente}}",
  "{{numero_cuota}}",
  "{{monto_cuota}}",
  "{{monto_total_deuda}}",
  "{{fecha_vencimiento}}",
  "{{dias_atraso}}",
  "{{link_pago}}",
  "{{nombre_empresa}}",
  "{{telefono_empresa}}",
];

const CANAL_COLOR: Record<Canal, string> = {
  EMAIL: "bg-blue-100 text-blue-700",
  WHATSAPP: "bg-emerald-100 text-emerald-700",
  SMS: "bg-purple-100 text-purple-700",
};

export default function PlantillasCobranzaPage() {
  const [plantillas, setPlantillas] = useState<Plantilla[]>(PLANTILLAS_DEFAULT);
  const [editing, setEditing] = useState<Plantilla | null>(null);
  const [editData, setEditData] = useState<Partial<Plantilla>>({});

  function handleEdit(p: Plantilla) {
    setEditing(p);
    setEditData({ ...p });
  }

  function handleSave() {
    setPlantillas((prev) => prev.map((p) => (p.id === editing!.id ? { ...p, ...editData } : p)));
    setEditing(null);
  }

  return (
    <section className="space-y-6">
      <header>
        <Link href="/gestiones" className="text-xs text-[var(--muted)] hover:underline">
          ← Gestiones
        </Link>
        <h2 className="mt-1 text-2xl font-semibold">Plantillas de cobranza</h2>
        <p className="text-sm text-[var(--muted)]">Mensajes por canal y tramo de mora</p>
      </header>

      <div className="card p-4">
        <p className="text-xs font-medium text-[var(--muted)] mb-2">Variables disponibles</p>
        <div className="flex flex-wrap gap-1">
          {VARIABLES.map((v) => (
            <code key={v} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              {v}
            </code>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {plantillas.map((p) => (
          <div key={p.id} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-semibold">{p.nombre}</p>
                  <p className="text-xs text-[var(--muted)]">
                    Tramo: {p.tramo} •{" "}
                    {p.dias_desde < 0
                      ? `${Math.abs(p.dias_desde)} días antes`
                      : `${p.dias_desde}–${p.dias_hasta === 999 ? "∞" : p.dias_hasta} días`}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CANAL_COLOR[p.canal]}`}>
                  {p.canal}
                </span>
              </div>
              <button
                onClick={() => handleEdit(p)}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                Editar
              </button>
            </div>
            <div className="p-4">
              {p.asunto && (
                <p className="mb-1 text-xs font-medium text-[var(--muted)]">Asunto: {p.asunto}</p>
              )}
              <pre className="whitespace-pre-wrap font-sans text-xs text-[var(--muted)]">{p.cuerpo}</pre>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl space-y-4 rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Editar: {editing.nombre}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Canal</label>
                <select
                  value={editData.canal ?? "EMAIL"}
                  onChange={(e) => setEditData({ ...editData, canal: e.target.value as Canal })}
                  className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <option value="EMAIL">Email</option>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="SMS">SMS</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Asunto (email)</label>
                <input
                  value={editData.asunto ?? ""}
                  onChange={(e) => setEditData({ ...editData, asunto: e.target.value })}
                  className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Cuerpo del mensaje</label>
              <textarea
                value={editData.cuerpo ?? ""}
                onChange={(e) => setEditData({ ...editData, cuerpo: e.target.value })}
                rows={8}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 font-mono text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
