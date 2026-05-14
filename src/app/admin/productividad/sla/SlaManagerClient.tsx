"use client";

import { useState } from "react";
import { Plus, Edit2, ToggleLeft, ToggleRight } from "lucide-react";

interface Category {
  id: string;
  name: string;
  sla: { id: string; maxDays: number; active: boolean } | null;
}

export function SlaManagerClient({ categories }: { categories: Category[] }) {
  const [cats, setCats] = useState(categories);
  const [editing, setEditing] = useState<{ categoryId: string; maxDays: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!editing || editing.maxDays < 1) { setError("Ingrese días válidos"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/productividad/sla", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: editing.categoryId, maxDays: editing.maxDays }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error"); return; }
      setCats((prev) =>
        prev.map((c) =>
          c.id === editing.categoryId
            ? { ...c, sla: { id: data.definition.id, maxDays: data.definition.maxDays, active: true } }
            : c
        )
      );
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(categoryId: string, slaId: string) {
    try {
      const res = await fetch("/api/productividad/sla", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", id: slaId }),
      });
      const data = await res.json();
      if (!res.ok) return;
      setCats((prev) =>
        prev.map((c) =>
          c.id === categoryId && c.sla ? { ...c, sla: { ...c.sla, active: data.definition.active } } : c
        )
      );
    } catch {}
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--border-glass)] flex items-center justify-between" style={{ background: "var(--surface-2)" }}>
        <h2 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>
          Definiciones de SLA por Categoría
        </h2>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Solo Jefe de Grupo y SuperAdmin</span>
      </div>
      <div className="divide-y divide-[var(--border-glass)]">
        {cats.map((cat) => (
          <div key={cat.id} className="px-6 py-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="font-semibold text-sm text-[var(--text)]">{cat.name}</div>
              {cat.sla ? (
                <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  SLA: <strong style={{ color: "var(--gold)" }}>{cat.sla.maxDays} días</strong>{" "}
                  · {cat.sla.active ? "Activo" : "Inactivo"}
                </div>
              ) : (
                <div className="text-[10px] mt-0.5 italic" style={{ color: "var(--text-muted)" }}>Sin SLA definido</div>
              )}
            </div>

            {editing?.categoryId === cat.id ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={editing.maxDays}
                  onChange={(e) => setEditing((prev) => prev ? { ...prev, maxDays: parseInt(e.target.value) } : null)}
                  className="w-20 px-2 py-1.5 text-sm border rounded-md outline-none focus:border-[var(--gold)]"
                  style={{ borderColor: "var(--border-glass)" }}
                  placeholder="días"
                />
                <span className="text-xs text-[var(--text-muted)]">días</span>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 text-[11px] font-bold rounded-md text-[var(--text)] transition-colors"
                  style={{ background: "var(--gold)", color: "var(--text)" }}
                >
                  {saving ? "..." : "Guardar"}
                </button>
                <button
                  onClick={() => { setEditing(null); setError(""); }}
                  className="px-3 py-1.5 text-[11px] font-bold rounded-md border transition-colors"
                  style={{ borderColor: "var(--border-glass)", color: "var(--text-muted)" }}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {cat.sla && (
                  <button
                    onClick={() => handleToggle(cat.id, cat.sla!.id)}
                    className="p-1.5 rounded-md transition-colors hover:bg-[var(--surface)]"
                    title={cat.sla.active ? "Desactivar" : "Activar"}
                  >
                    {cat.sla.active
                      ? <ToggleRight className="w-4 h-4" style={{ color: "#4ADE80" }} />
                      : <ToggleLeft className="w-4 h-4" style={{ color: "var(--text-muted)" }} />}
                  </button>
                )}
                <button
                  onClick={() => setEditing({ categoryId: cat.id, maxDays: cat.sla?.maxDays ?? 30 })}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-md border transition-colors hover:bg-[var(--surface-2)]"
                  style={{ borderColor: "var(--border-glass)", color: "var(--gold)" }}
                >
                  {cat.sla ? <Edit2 className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                  {cat.sla ? "Editar" : "Definir SLA"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {error && (
        <div className="mx-6 mb-4 px-3 py-2 rounded-md text-sm" style={{ background: "rgba(220, 38, 38, 0.1)", color: "var(--red)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
