"use client";

import { Clock, User, Calendar, AlertCircle, CheckCircle, FileText } from "lucide-react";

interface CaseCardProps {
  id: string;
  title: string;
  client: string;
  status: "PENDIENTE" | "ASIGNADO" | "EN_PROGRESO" | "FINALIZADO";
  priority?: "ALTA" | "MEDIA" | "BAJA";
  assignedTo?: string;
  createdAt: Date;
  dueDate?: Date;
  onClick?: () => void;
}

export function CaseCard({
  id,
  title,
  client,
  status,
  priority = "MEDIA",
  assignedTo,
  createdAt,
  dueDate,
  onClick
}: CaseCardProps) {
  const statusConfig = {
    PENDIENTE: {
      label: "Pendiente",
      color: "#FBBF24",
      bg: "rgba(251, 191, 36, 0.1)",
      icon: <Clock size={16} />
    },
    ASIGNADO: {
      label: "Asignado",
      color: "#60A5FA",
      bg: "rgba(96, 165, 250, 0.1)",
      icon: <User size={16} />
    },
    EN_PROGRESO: {
      label: "En Progreso",
      color: "var(--gold)",
      bg: "rgba(201, 168, 76, 0.1)",
      icon: <FileText size={16} />
    },
    FINALIZADO: {
      label: "Finalizado",
      color: "#4ADE80",
      bg: "rgba(74, 222, 128, 0.1)",
      icon: <CheckCircle size={16} />
    }
  };

  const priorityConfig = {
    ALTA: { color: "var(--red)", bg: "rgba(248, 113, 113, 0.1)" },
    MEDIA: { color: "#FBBF24", bg: "rgba(251, 191, 36, 0.1)" },
    BAJA: { color: "var(--text-muted)", bg: "rgba(138, 128, 112, 0.1)" }
  };

  const currentStatus = statusConfig[status];
  const currentPriority = priorityConfig[priority];

  return (
    <div
      onClick={onClick}
      className="rounded-xl p-5 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-glass)"
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
              #{id}
            </span>
            <div
              className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background: currentPriority.bg,
                color: currentPriority.color
              }}
            >
              {priority}
            </div>
          </div>
          <h3 className="text-base font-bold mb-1" style={{ color: "var(--text)" }}>
            {title}
          </h3>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Cliente: {client}
          </p>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{
            background: currentStatus.bg,
            color: currentStatus.color
          }}
        >
          {currentStatus.icon}
          <span className="text-xs font-semibold">{currentStatus.label}</span>
        </div>
      </div>

      {/* Details */}
      <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
        <div className="flex items-center gap-1.5">
          <Calendar size={14} />
          <span>{createdAt.toLocaleDateString()}</span>
        </div>
        {assignedTo && (
          <div className="flex items-center gap-1.5">
            <User size={14} />
            <span>{assignedTo}</span>
          </div>
        )}
        {dueDate && (
          <div className="flex items-center gap-1.5">
            <AlertCircle size={14} />
            <span>Vence: {dueDate.toLocaleDateString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
