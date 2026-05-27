"use client";

import Link from "next/link";
import { useState } from "react";

type Carta = {
  id: string;
  nombre: string;
  dias_desde: number;
  dias_hasta: number;
  asunto: string;
  cuerpo: string;
  canal: "EMAIL" | "WHATSAPP";
};

const CARTAS_DEFAULT: Carta[] = [
  {
    id: "aviso-1",
    nombre: "Aviso previo al vencimiento",
    dias_desde: -3,
    dias_hasta: 0,
    asunto: "Recordatorio de pago próximo",
    cuerpo: "Estimado {{nombre_cliente}},\n\nLe recordamos que su cuota N°{{numero_cuota}} de {{monto_cuota}} vence el {{fecha_vencimiento}}.\n\nPuede pagar en: {{link_pago}}\n\nAtte. {{nombre_empresa}}",
    canal: "EMAIL",
  },
  {
    id: "mora-10",
    nombre: "Cuota vencida (1-10 días)",
    dias_desde: 1,
    dias_hasta: 10,
    asunto: "Cuota vencida — acción requerida",
    cuerpo: "Estimado {{nombre_cliente}},\n\nSu cuota de {{monto_cuota}} se encuentra vencida desde {{fecha_vencimiento}} ({{dias_atraso}} días de atraso).\n\nLe solicitamos regularizar su situación a la brevedad.\n\n{{link_pago}}",
    canal: "EMAIL",
  },
  {
    id: "mora-30",
    nombre: "Mora grave (30+ días)",
    dias_desde: 30,
    dias_hasta: 999,
    asunto: "Aviso final de cobranza",
    cuerpo: "Estimado {{nombre_cliente}},\n\nSu deuda de {{monto_total_deuda}} se encuentra con {{dias_atraso}} días de atraso.\n\nDe no regularizar en los próximos 5 días hábiles, su caso pasará a cobranza judicial.\n\nContacte a: {{telefono_empresa}}",
    canal: "EMAIL",
  },
];

const VARIABLES = ["{{nombre_cliente}}", "{{rut_cliente}}", "{{numero_cuota}}", "{{monto_cuota}}", "{{monto_total_deuda}}", "{{fecha_vencimiento}}", "{{dias_atraso}}", "{{link_pago}}", "{{nombre_empresa}}", "{{telefono_empresa}}"];

export default function CartasCobranzaPage() {
  const [cartas, setCartas] = useState<Carta[]>(CARTAS_DEFAULT);
  const [editing, setEditing] = useState<Carta | null>(null);
  const [editData, setEditData] = useState<Partial<Carta>>({});

  function handleEdit(carta: Carta) {
    setEditing(carta);
    setEditData({ ...carta });
  }

  function handleSave() {
    setCartas(prev => prev.map(c => c.id === editing!.id ? { ...c, ...editData } : c));
    setEditing(null);
  }

  return (
    <section className="space-y-6">
      <header>
        <Link href="/configuracion" className="text-xs text-[var(--muted)] hover:underline">← Configuración</Link>
        <h2 className="mt-1 text-2xl font-semibold">Cartas de cobranza</h2>
        <p className="text-sm text-[var(--muted)]">Plantillas de comunicación por tramo de mora</p>
      </header>

      <div className="card p-4">
        <p className="text-xs font-medium text-[var(--muted)] mb-2">Variables disponibles</p>
        <div className="flex flex-wrap gap-1">
          {VARIABLES.map(v => <code key={v} className="bg-slate-100 rounded px-1.5 py-0.5 text-xs">{v}</code>)}
        </div>
      </div>

      <div className="space-y-4">
        {cartas.map(carta => (
          <div key={carta.id} className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between bg-slate-50">
              <div>
                <p className="font-semibold text-sm">{carta.nombre}</p>
                <p className="text-xs text-[var(--muted)]">
                  Días de atraso: {carta.dias_desde === -3 ? "3 días antes" : `${carta.dias_desde}–${carta.dias_hasta === 999 ? "∞" : carta.dias_hasta}`} días
                  {" "} • Canal: {carta.canal}
                </p>
              </div>
              <button onClick={() => handleEdit(carta)}
                className="text-xs text-[var(--accent)] hover:underline">Editar</button>
            </div>
            <div className="p-4">
              <p className="text-xs font-medium text-[var(--muted)] mb-1">Asunto: {carta.asunto}</p>
              <pre className="text-xs text-[var(--muted)] whitespace-pre-wrap font-sans">{carta.cuerpo}</pre>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 space-y-4">
            <h3 className="font-semibold text-lg">Editar: {editing.nombre}</h3>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Asunto</label>
              <input value={editData.asunto ?? ""} onChange={e => setEditData({ ...editData, asunto: e.target.value })}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Canal</label>
              <select value={editData.canal ?? "EMAIL"} onChange={e => setEditData({ ...editData, canal: e.target.value as "EMAIL" | "WHATSAPP" })}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                <option value="EMAIL">Email</option>
                <option value="WHATSAPP">WhatsApp</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Cuerpo del mensaje</label>
              <textarea value={editData.cuerpo ?? ""} onChange={e => setEditData({ ...editData, cuerpo: e.target.value })}
                rows={8} className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm font-mono" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancelar</button>
              <button onClick={handleSave} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
