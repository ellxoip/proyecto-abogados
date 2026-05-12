"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Trash2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { ACTIVITY_LABELS } from "@/lib/productividad/metrics";
import { ActivityCategory } from "@prisma/client";

interface Entry {
  id: string;
  date: string;
  durationMinutes: number;
  category: ActivityCategory;
  description: string | null;
  lawyerId: string;
  lawyerName: string;
  caseId: string;
  caseCode: string;
  canEdit: boolean;
}

export function HoursTableClient({ entries, isManager }: { entries: Entry[]; isManager: boolean }) {
  const [rows, setRows] = useState(entries);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const filtered = rows.filter(
    (e) =>
      e.caseCode.toLowerCase().includes(filter.toLowerCase()) ||
      e.lawyerName.toLowerCase().includes(filter.toLowerCase()) ||
      ACTIVITY_LABELS[e.category].toLowerCase().includes(filter.toLowerCase())
  );

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta entrada? Solo es posible en las primeras 24 horas.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/productividad/time-entries/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Error al eliminar"); return; }
      setRows((prev) => prev.filter((e) => e.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-12 text-center shadow-sm">
        <p className="text-sm italic" style={{ color: "var(--text-muted)" }}>No hay registros de horas en los últimos 30 días.</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--border-glass)] flex items-center gap-4" style={{ background: "var(--surface-2)" }}>
        <input
          type="text"
          placeholder="Filtrar por expediente, abogado o actividad..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border rounded-md outline-none focus:border-[var(--gold)] transition-colors"
          style={{ borderColor: "var(--border-glass)", background: "#FFFFFF" }}
        />
        <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
          {filtered.length} registros
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface)" }}>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>Fecha</th>
              {isManager && <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>Abogado</th>}
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>Expediente</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>Actividad</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>Horas</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>Descripción</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-glass)]">
            {filtered.map((e) => (
              <tr key={e.id} className="hover:bg-[var(--surface-2)] transition-colors">
                <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                  {format(new Date(e.date), "dd/MM/yyyy")}
                </td>
                {isManager && (
                  <td className="px-4 py-3 font-medium text-[var(--text)]">{e.lawyerName}</td>
                )}
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/casos/${e.caseId}`}
                    className="font-bold hover:underline flex items-center gap-1"
                    style={{ color: "var(--gold)" }}
                  >
                    {e.caseCode}
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: "var(--surface-2)", color: "var(--gold)" }}
                  >
                    {ACTIVITY_LABELS[e.category]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-bold" style={{ color: "var(--text)" }}>
                  {(e.durationMinutes / 60).toFixed(1)}h
                </td>
                <td className="px-4 py-3 text-[11px] max-w-[200px] truncate" style={{ color: "var(--text-muted)" }}>
                  {e.description || "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {e.canEdit && (
                    <button
                      onClick={() => handleDelete(e.id)}
                      disabled={deleting === e.id}
                      className="p-1.5 rounded transition-colors hover:bg-[var(--red-dim)] disabled:opacity-40"
                      title="Eliminar (solo primeras 24h)"
                    >
                      <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--red)" }} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
