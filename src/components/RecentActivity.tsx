"use client";

import {
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  User,
  DollarSign,
  MessageSquare
} from "lucide-react";

interface Activity {
  id: string;
  type: "case_created" | "case_updated" | "case_completed" | "payment" | "message";
  title: string;
  description: string;
  user: string;
  timestamp: string;
}

interface RecentActivityProps {
  activities?: Activity[];
}

export function RecentActivity({ activities }: RecentActivityProps) {
  const defaultActivities: Activity[] = activities ?? [
    {
      id: "1",
      type: "case_created",
      title: "Nuevo caso creado",
      description: "Caso #2024-001 - Demanda Civil",
      user: "Juan Pérez",
      timestamp: "Hace 5 minutos"
    },
    {
      id: "2",
      type: "payment",
      title: "Pago confirmado",
      description: "$1,500 - Cuota mensual",
      user: "María García",
      timestamp: "Hace 15 minutos"
    },
    {
      id: "3",
      type: "case_updated",
      title: "Caso actualizado",
      description: "Caso #2024-045 - Documentos agregados",
      user: "Carlos López",
      timestamp: "Hace 1 hora"
    },
    {
      id: "4",
      type: "case_completed",
      title: "Caso completado",
      description: "Caso #2024-023 - Sentencia favorable",
      user: "Ana Martínez",
      timestamp: "Hace 2 horas"
    },
    {
      id: "5",
      type: "message",
      title: "Nuevo mensaje",
      description: "Cliente solicitó información adicional",
      user: "Roberto Silva",
      timestamp: "Hace 3 horas"
    }
  ];

  const getActivityIcon = (type: Activity["type"]) => {
    switch (type) {
      case "case_created":
        return { icon: <FileText size={18} />, color: "var(--gold)", bg: "rgba(201, 168, 76, 0.1)" };
      case "case_updated":
        return { icon: <AlertCircle size={18} />, color: "#FBBF24", bg: "rgba(251, 191, 36, 0.1)" };
      case "case_completed":
        return { icon: <CheckCircle size={18} />, color: "#4ADE80", bg: "rgba(74, 222, 128, 0.1)" };
      case "payment":
        return { icon: <DollarSign size={18} />, color: "#60A5FA", bg: "rgba(96, 165, 250, 0.1)" };
      case "message":
        return { icon: <MessageSquare size={18} />, color: "var(--red)", bg: "rgba(248, 113, 113, 0.1)" };
      default:
        return { icon: <Clock size={18} />, color: "var(--text-muted)", bg: "rgba(138, 128, 112, 0.1)" };
    }
  };

  return (
    <div
      className="rounded-xl p-6"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-glass)"
      }}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold" style={{ color: "var(--text)" }}>
          Actividad Reciente
        </h2>
        <button
          className="text-sm font-semibold hover:underline"
          style={{ color: "var(--gold)" }}
        >
          Ver todo
        </button>
      </div>

      <div className="space-y-4">
        {defaultActivities.map((activity) => {
          const { icon, color, bg } = getActivityIcon(activity.type);
          return (
            <div
              key={activity.id}
              className="flex items-start gap-4 p-3 rounded-lg transition-all duration-200 hover:bg-[rgba(255,255,255,0.02)] cursor-pointer"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: bg, color }}
              >
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold mb-0.5" style={{ color: "var(--text)" }}>
                      {activity.title}
                    </h3>
                    <p className="text-sm mb-1" style={{ color: "var(--text-muted)" }}>
                      {activity.description}
                    </p>
                    <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      <User size={12} />
                      <span>{activity.user}</span>
                      <span>•</span>
                      <span>{activity.timestamp}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
