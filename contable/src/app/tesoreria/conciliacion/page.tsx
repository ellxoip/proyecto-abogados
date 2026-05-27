"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";

type Cuenta = { id: number; nombre: string; banco: { nombre: string } };
type Item = { fecha_movimiento: string; glosa: string; cargo: string | null; abono: string | null; conciliado: boolean };

export default function ConciliacionPage() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cuentaId, setCuentaId] = useState("");
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));
  const [items, setItems] = useState<Item[]>([]);
  const [saldoBanco, setSaldoBanco] = useState("");
  const [saldoSistema, setSaldoSistema] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    fetch("/api/tesoreria/cuentas").then((r) => r.json()).then(setCuentas);
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMensaje("Procesando cartola...");

    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { header: 1 }) as unknown as unknown[][];

    const parsed: Item[] = rows.slice(1).filter((r) => r[0]).map((r) => ({
      fecha_movimiento: String(r[0] ?? ""),
      glosa: String(r[1] ?? ""),
      cargo: r[2] ? String(r[2]) : null,
      abono: r[3] ? String(r[3]) : null,
      conciliado: false,
    }));

    setItems(parsed);
    setUploading(false);
    setMensaje(`${parsed.length} movimientos cargados desde cartola`);
  }

  const totalCargos = items.reduce((s, i) => s + (i.cargo ? Number(i.cargo) : 0), 0);
  const totalAbonos = items.reduce((s, i) => s + (i.abono ? Number(i.abono) : 0), 0);
  const diferencia = saldoBanco && saldoSistema ? Number(saldoBanco) - Number(saldoSistema) : null;

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Conciliación bancaria</h2>
        <p className="text-sm text-[var(--muted)]">Compara cartola del banco vs movimientos del sistema</p>
      </header>

      <div className="card p-5 space-y-4">
        <h3 className="font-semibold">Configurar conciliación</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Cuenta bancaria</label>
            <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
              <option value="">Seleccionar...</option>
              {cuentas.map((c) => <option key={c.id} value={c.id}>{c.banco.nombre} — {c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Período</label>
            <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Saldo según banco</label>
            <input type="number" value={saldoBanco} onChange={(e) => setSaldoBanco(e.target.value)} placeholder="0" className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Saldo según sistema</label>
            <input type="number" value={saldoSistema} onChange={(e) => setSaldoSistema(e.target.value)} placeholder="0" className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Cargar cartola (Excel — columnas: Fecha | Glosa | Cargo | Abono)</label>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} className="text-sm" />
          {mensaje && <p className="mt-1 text-xs text-[var(--accent)]">{mensaje}</p>}
        </div>
      </div>

      {diferencia !== null && (
        <div className={`card p-4 ${diferencia === 0 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
          <p className="font-semibold">
            {diferencia === 0 ? "Saldos conciliados correctamente" : `Diferencia: ${formatCurrency(Math.abs(diferencia))}`}
          </p>
          {diferencia !== 0 && <p className="text-sm">Revisar movimientos sin conciliar</p>}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card p-4">
              <p className="text-xs text-[var(--muted)]">Total cargos (cartola)</p>
              <p className="mt-1 text-xl font-bold text-rose-600">{formatCurrency(totalCargos)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-[var(--muted)]">Total abonos (cartola)</p>
              <p className="mt-1 text-xl font-bold text-emerald-600">{formatCurrency(totalAbonos)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-[var(--muted)]">Movimientos en cartola</p>
              <p className="mt-1 text-xl font-bold">{items.length}</p>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[var(--muted)]">
                <tr>
                  <th className="table-cell font-medium">Fecha</th>
                  <th className="table-cell font-medium">Glosa</th>
                  <th className="table-cell font-medium text-right">Cargo</th>
                  <th className="table-cell font-medium text-right">Abono</th>
                  <th className="table-cell font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="table-cell text-xs">{item.fecha_movimiento}</td>
                    <td className="table-cell">{item.glosa}</td>
                    <td className="table-cell text-right text-rose-600">{item.cargo ? formatCurrency(Number(item.cargo)) : "—"}</td>
                    <td className="table-cell text-right text-emerald-600">{item.abono ? formatCurrency(Number(item.abono)) : "—"}</td>
                    <td className="table-cell">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${item.conciliado ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {item.conciliado ? "Conciliado" : "Pendiente"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {loading && <p className="text-sm text-[var(--muted)]">Cargando...</p>}
    </section>
  );
}
