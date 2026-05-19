"use client";

import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area 
} from "recharts";
import { Smile, Meh, Frown, BarChart3, PieChart as PieIcon } from "lucide-react";

type TrendPoint = { name: string; casos: number; cierres: number };

type Props = {
  categoryData: any[];
  satisfaction: { happy: number; neutral: number; sad: number };
  trendData: TrendPoint[];
};

const SAT_COLORS = ["#10B981", "#F59E0B", "#EF4444"]; // Emerald, Amber, Red

export function AnalyticsCharts({ categoryData, satisfaction, trendData }: Props) {
  const satData = [
    { name: "Satisfecho", value: satisfaction.happy, icon: Smile },
    { name: "Regular", value: satisfaction.neutral, icon: Meh },
    { name: "Insatisfecho", value: satisfaction.sad, icon: Frown },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      
      {/* Category Distribution - Bar Chart */}
      <div className="lg:col-span-8 bg-[var(--surface)] border border-[var(--border-glass)] rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[var(--gold)]" />
            <h3 className="text-sm font-bold text-[var(--text)] uppercase tracking-wider">Volumen por Categoría</h3>
          </div>
        </div>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 40, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#F1F5F9" />
              <XAxis type="number" hide />
              <YAxis 
                dataKey="name" 
                type="category" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 700, fill: "#64748B" }}
                width={120}
              />
              <Tooltip 
                cursor={{ fill: "var(--surface-2)" }}
                contentStyle={{ borderRadius: "8px", border: "1px solid var(--border-glass)", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
              />
              <Bar dataKey="count" fill="var(--gold)" radius={[0, 4, 4, 0]} barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Satisfaction - Pie Chart with Faces */}
      <div className="lg:col-span-4 bg-[var(--surface)] border border-[var(--border-glass)] rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <PieIcon className="w-5 h-5 text-[var(--gold)]" />
            <h3 className="text-sm font-bold text-[var(--text)] uppercase tracking-wider">Nivel de Satisfacción</h3>
          </div>
        </div>
        <div className="h-[300px] w-full relative">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <PieChart>
              <Pie
                data={satData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {satData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={SAT_COLORS[index % SAT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          
          {/* Legend with Faces */}
          <div className="mt-6 space-y-4">
            {satData.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded" style={{ backgroundColor: `${SAT_COLORS[idx]}15` }}>
                      <Icon className="w-4 h-4" style={{ color: SAT_COLORS[idx] }} />
                    </div>
                    <span className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">{item.name}</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900">{item.value}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Evolution / Deadlines - Area Chart (Mocked Curve) */}
      <div className="lg:col-span-12 bg-[var(--surface)] border border-[var(--border-glass)] rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[var(--gold)]" />
            <h3 className="text-sm font-bold text-[var(--text)] uppercase tracking-wider">Efectividad y Plazos (Tendencia)</h3>
          </div>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--gold)" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="var(--gold)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94A3B8" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94A3B8" }} />
              <Tooltip />
              <Area type="monotone" dataKey="casos" stroke="var(--gold)" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
              <Area type="monotone" dataKey="cierres" stroke="#10B981" strokeWidth={3} fillOpacity={0} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-8 mt-4">
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[var(--gold)]" />
              <span className="text-[10px] font-bold uppercase text-slate-500">Ingresos</span>
           </div>
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#10B981]" />
              <span className="text-[10px] font-bold uppercase text-slate-500">Cierres</span>
           </div>
        </div>
      </div>

    </div>
  );
}

function TrendingUp(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}
