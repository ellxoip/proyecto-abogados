"use client";

import { useState } from "react";
import { Role } from "@prisma/client";
import { ClientChat } from "./ClientChat";
import { StaffChat } from "./StaffChat";
import { Lock, Users } from "lucide-react";

type CommentDTO = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
};

type Props = {
  caseId: string;
  realtimeToken: string;
  currentUserId: string;
  currentRole: Role;
  publicComments: CommentDTO[];
  internalComments: CommentDTO[];
  isFinished?: boolean;
};

export function CaseChatTabs({
  caseId,
  realtimeToken,
  currentUserId,
  currentRole,
  publicComments,
  internalComments,
  isFinished,
}: Props) {
  const canSeeInternal = currentRole !== Role.CLIENTE;
  const [tab, setTab] = useState<"public" | "internal">("public");
  const active = canSeeInternal ? tab : "public";

  return (
    <div className="flex flex-col h-full">
      {canSeeInternal && (
        <div
          className="flex border-b"
          style={{ borderColor: "var(--border-glass)", background: "var(--surface-2)" }}
        >
          <TabButton
            active={active === "public"}
            icon={Users}
            label="Cliente"
            badge={publicComments.length}
            onClick={() => setTab("public")}
          />
          <TabButton
            active={active === "internal"}
            icon={Lock}
            label="Equipo (Interno)"
            badge={internalComments.length}
            onClick={() => setTab("internal")}
          />
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {active === "public" ? (
          <ClientChat
            caseId={caseId}
            initialComments={publicComments}
            realtimeToken={realtimeToken}
            currentUserId={currentUserId}
            isFinished={isFinished}
            role={currentRole}
          />
        ) : (
          <StaffChat
            caseId={caseId}
            initialComments={internalComments}
            realtimeToken={realtimeToken}
            currentUserId={currentUserId}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  label,
  icon: Icon,
  badge,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 px-4 py-3 text-[11px] uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition-colors"
      style={{
        color: active ? "var(--gold)" : "var(--text-muted)",
        background: active ? "#FFFFFF" : "transparent",
        borderBottom: active ? "2px solid var(--gold)" : "2px solid transparent",
      }}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className="text-[9px] px-1.5 py-0.5 rounded font-bold"
          style={{
            background: active ? "var(--gold)20" : "var(--border-glass)",
            color: active ? "var(--gold)" : "var(--text-muted)",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
