"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { formatCurrency } from "@/lib/format";

interface MonthData { mes: string; ingresos: number; gastos: number; }

const fmt = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

const toCurrency = (v: unknown) => formatCurrency(typeof v === "number" ? v : Number(v ?? 0));

export default function BiCharts({ monthlyData }: { monthlyData: MonthData[] }) {
  const withUtilidad = monthlyData.map(d => ({ ...d, utilidad: d.ingresos - d.gastos }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card p-5">
        <h3 className="font-semibold mb-4">Ingresos vs Gastos (últimos 6 meses)</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => toCurrency(v)} />
            <Legend />
            <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="gastos" name="Gastos" fill="#f59e0b" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-4">Utilidad mensual</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={withUtilidad} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => toCurrency(v)} />
            <Line type="monotone" dataKey="utilidad" name="Utilidad" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
