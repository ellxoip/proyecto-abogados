"use client";

import { useState } from "react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";

type ChartType = "bar" | "line" | "pie" | "table";
type AgrupacionType = "mes" | "cliente" | "servicio" | "estado" | "tipo";

const METRICS = [
  { key: "pagos_monto", label: "Pagos — monto cobrado", color: "#10b981" },
  { key: "cuotas_vencidas", label: "Cuotas vencidas — monto", color: "#f59e0b" },
  { key: "contratos_activos", label: "Contratos activos — cantidad", color: "#3b82f6" },
  { key: "gestiones_count", label: "Gestiones — cantidad", color: "#8b5cf6" },
  { key: "documentos_venta", label: "Ventas — monto facturado", color: "#06b6d4" },
];

type DataPoint = { name: string; value: number };

export default function BiConstructorPage() {
  const [metrica, setMetrica] = useState("pagos_monto");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [agrupacion, setAgrupacion] = useState<AgrupacionType>("mes");
  const [data, setData] = useState<DataPoint[] | null>(null);
  const [loading, setLoading] = useState(false);

  const metricaDef = METRICS.find(m => m.key === metrica)!;

  async function handleGenerar() {
    setLoading(true);
    const r = await fetch(`/api/bi/constructor?metrica=${metrica}&agrupar=${agrupacion}`);
    if (r.ok) setData(await r.json());
    setLoading(false);
  }

  const COLORS = ["#10b981","#3b82f6","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#f97316"];

  return (
    <section className="space-y-6">
      <header>
        <Link href="/bi" className="text-xs text-[var(--muted)] hover:underline">← BI</Link>
        <h2 className="text-2xl font-semibold mt-1">Constructor de reportes</h2>
        <p className="text-sm text-[var(--muted)]">Drag &amp; drop para armar visualizaciones personalizadas</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <h3 className="font-semibold text-sm">Métrica</h3>
            {METRICS.map(m => (
              <label key={m.key} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="metrica" value={m.key} checked={metrica === m.key}
                  onChange={() => { setMetrica(m.key); setData(null); }} />
                <span className="text-sm">{m.label}</span>
              </label>
            ))}
          </div>

          <div className="card p-4 space-y-3">
            <h3 className="font-semibold text-sm">Agrupación</h3>
            {([["mes","Por mes"],["cliente","Por cliente"],["servicio","Por servicio"],["estado","Por estado"]] as [AgrupacionType, string][]).map(([val, lbl]) => (
              <label key={val} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="agrupacion" value={val} checked={agrupacion === val}
                  onChange={() => { setAgrupacion(val); setData(null); }} />
                <span className="text-sm">{lbl}</span>
              </label>
            ))}
          </div>

          <div className="card p-4 space-y-3">
            <h3 className="font-semibold text-sm">Tipo de visualización</h3>
            {(["bar","line","pie","table"] as ChartType[]).map(t => (
              <label key={t} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="chart" value={t} checked={chartType === t} onChange={() => setChartType(t)} />
                <span className="text-sm capitalize">{t === "bar" ? "Barras" : t === "line" ? "Línea" : t === "pie" ? "Torta" : "Tabla"}</span>
              </label>
            ))}
          </div>

          <button onClick={handleGenerar} disabled={loading}
            className="w-full rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {loading ? "Cargando..." : "Generar visualización"}
          </button>
        </div>

        <div className="lg:col-span-3">
          {data === null ? (
            <div className="card p-12 text-center text-[var(--muted)]">
              <p>Configura y genera una visualización</p>
            </div>
          ) : data.length === 0 ? (
            <div className="card p-12 text-center text-[var(--muted)]">
              <p>Sin datos para la configuración seleccionada</p>
            </div>
          ) : (
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{metricaDef.label} — por {agrupacion}</h3>
              </div>

              {chartType === "bar" && (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip // eslint-disable-next-line @typescript-eslint/no-explicit-any
formatter={((v: number) => metrica.includes("monto") || metrica.includes("pagos") || metrica.includes("documentos") ? formatCurrency(v) : v) as any} />
                    <Bar dataKey="value" fill={metricaDef.color} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {chartType === "line" && (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip // eslint-disable-next-line @typescript-eslint/no-explicit-any
formatter={((v: number) => metrica.includes("monto") || metrica.includes("pagos") || metrica.includes("documentos") ? formatCurrency(v) : v) as any} />
                    <Line type="monotone" dataKey="value" stroke={metricaDef.color} strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}

              {chartType === "pie" && (
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                      {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip // eslint-disable-next-line @typescript-eslint/no-explicit-any
formatter={((v: number) => metrica.includes("monto") || metrica.includes("pagos") || metrica.includes("documentos") ? formatCurrency(v) : v) as any} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}

              {chartType === "table" && (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-[var(--muted)]">
                    <tr>
                      <th className="table-cell text-left font-medium">Agrupación</th>
                      <th className="table-cell text-right font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {data.map((d, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="table-cell">{d.name}</td>
                        <td className="table-cell text-right font-semibold">
                          {metrica.includes("monto") || metrica.includes("pagos") || metrica.includes("documentos")
                            ? formatCurrency(d.value)
                            : d.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
