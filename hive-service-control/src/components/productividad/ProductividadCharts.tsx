"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";

const GOLD = "var(--gold)";
const DARK = "var(--bg)";
const MUTED = "var(--text-muted)";

const PIE_COLORS = ["var(--gold)", "var(--bg)", "#4ADE80", "#FCD34D", "var(--red)", "var(--text-muted)"];

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg shadow-xl px-4 py-3 text-sm"
      style={{ background: "#FFFFFF", border: "1px solid var(--border-glass)", minWidth: 140 }}
    >
      {label && <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: MUTED }}>{label}</p>}
      {payload.map((p: any) => (
        <p key={p.name} className="font-semibold" style={{ color: p.color ?? DARK }}>
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

interface SlaBarChartProps {
  data: { name: string; cumplido: number; en_riesgo: number; incumplido: number }[];
}

export function SlaBarChart({ data }: SlaBarChartProps) {
  if (!data.length) return <EmptyChart label="Sin datos de SLA" />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-glass)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
        <Bar dataKey="cumplido" name="Cumplido" fill="#4ADE80" radius={[3, 3, 0, 0]} />
        <Bar dataKey="en_riesgo" name="En riesgo" fill="#FCD34D" radius={[3, 3, 0, 0]} />
        <Bar dataKey="incumplido" name="Incumplido" fill="var(--red)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface ActivityPieChartProps {
  data: { label: string; totalMinutes: number; percentage: number }[];
}

export function ActivityPieChart({ data }: ActivityPieChartProps) {
  if (!data.length) return <EmptyChart label="Sin registros de horas" />;
  const pieData = data.map((d) => ({ name: d.label, value: Math.round(d.totalMinutes / 60 * 10) / 10 }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={pieData}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={3}
          dataKey="value"
        >
          {pieData.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-lg shadow-xl px-4 py-3 text-sm" style={{ background: "#FFFFFF", border: "1px solid var(--border-glass)" }}>
                <p className="font-bold" style={{ color: DARK }}>{payload[0].name}</p>
                <p style={{ color: MUTED }}>{payload[0].value}h</p>
              </div>
            );
          }}
        />
        <Legend
          formatter={(value) => <span style={{ fontSize: 10, color: MUTED }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

interface RankingBarChartProps {
  data: { fullName: string; compositeScore: number; casesFinished: number }[];
}

export function RankingBarChart({ data }: RankingBarChartProps) {
  if (!data.length) return <EmptyChart label="Sin datos de ranking" />;
  const chartData = data.slice(0, 8).map((d) => ({
    name: d.fullName.split(" ")[0],
    Score: Math.round(d.compositeScore),
    Casos: d.casesFinished,
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-glass)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="Score" name="Score" fill={GOLD} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface HoursAreaChartProps {
  data: { date: string; hours: number }[];
}

export function HoursAreaChart({ data }: HoursAreaChartProps) {
  if (!data.length) return <EmptyChart label="Sin registros de horas" />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
        <defs>
          <linearGradient id="hoursGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={GOLD} stopOpacity={0.3} />
            <stop offset="95%" stopColor={GOLD} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-glass)" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: MUTED }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: MUTED }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="hours" name="Horas" stroke={GOLD} strokeWidth={2} fill="url(#hoursGradient)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center">
      <p className="text-sm italic" style={{ color: MUTED }}>{label}</p>
    </div>
  );
}
