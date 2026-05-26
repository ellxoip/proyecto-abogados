import { CaseStage, Role } from "@/lib/db-enums";
import { CheckCircle2, Circle, Clock, FileText, Lock, UserCheck } from "lucide-react";
import { FinishCaseButton } from "@/components/FinishCaseButton";
import { AdvanceStageButton } from "./AdvanceStageButton";

type StepState = "done" | "current" | "blocked" | "pending";

type Props = {
  caseId: string;
  caseCode: string;
  stage: string;
  userRole: string;
  lawyerNames: string[];
  hasUpdates: boolean;
  hasResolutionDocument: boolean;
  blockedFromActions: boolean;
};

const stateLabels: Record<StepState, string> = {
  done: "Completado",
  current: "Accion requerida",
  blocked: "Bloqueado",
  pending: "Pendiente",
};

function stateStyle(state: StepState) {
  if (state === "done") {
    return {
      border: "rgba(16,185,129,0.35)",
      bg: "rgba(16,185,129,0.08)",
      color: "#10B981",
    };
  }
  if (state === "current") {
    return {
      border: "rgba(201,168,76,0.45)",
      bg: "rgba(201,168,76,0.10)",
      color: "var(--gold)",
    };
  }
  if (state === "blocked") {
    return {
      border: "rgba(239,68,68,0.35)",
      bg: "rgba(239,68,68,0.08)",
      color: "var(--red)",
    };
  }
  return {
    border: "var(--border-glass)",
    bg: "var(--surface)",
    color: "var(--text-muted)",
  };
}

function statusFor(done: boolean, current: boolean, blocked: boolean): StepState {
  if (done) return "done";
  if (blocked) return "blocked";
  if (current) return "current";
  return "pending";
}

function StepCard({
  number,
  title,
  description,
  state,
  icon: Icon,
  action,
}: {
  number: number;
  title: string;
  description: string;
  state: StepState;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}) {
  const style = stateStyle(state);
  const DoneIcon = state === "done" ? CheckCircle2 : state === "blocked" ? Lock : Circle;

  return (
    <div
      className="rounded-md border p-4 flex flex-col gap-3 min-h-[190px]"
      style={{ borderColor: style.border, background: style.bg }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-md border flex items-center justify-center flex-shrink-0"
            style={{ borderColor: style.border, color: style.color, background: "var(--surface)" }}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: style.color }}>
              Paso {number}
            </p>
            <h3 className="text-sm font-bold text-[var(--text)]">{title}</h3>
          </div>
        </div>
        <div
          className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-wider"
          style={{ borderColor: style.border, color: style.color, background: "var(--surface)" }}
        >
          <DoneIcon className="w-3 h-3" />
          {stateLabels[state]}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-[var(--text-muted)]">{description}</p>

      {action ? <div className="mt-auto">{action}</div> : null}
    </div>
  );
}

function AnchorAction({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-[11px] font-bold uppercase tracking-widest transition-all"
      style={{
        background: "var(--bg)",
        color: "var(--gold)",
        border: "1px solid rgba(201,168,76,0.35)",
      }}
    >
      {children}
    </a>
  );
}

export function CaseProgressChecklist({
  caseId,
  caseCode,
  stage,
  userRole,
  lawyerNames,
  hasUpdates,
  hasResolutionDocument,
  blockedFromActions,
}: Props) {
  const hasLawyer = lawyerNames.length > 0;
  const isOpen = stage === CaseStage.OPEN;
  const isInProgress = stage === CaseStage.IN_PROGRESS;
  const isFinished = stage === CaseStage.FINISHED;
  const isStaff = userRole !== Role.CLIENTE;
  const canAssign = userRole === Role.SUPER_ADMIN || userRole === Role.JEFE_DE_MESA;
  const canWork = isStaff && !blockedFromActions;
  const completed = [hasLawyer, isInProgress || isFinished, hasUpdates, isFinished].filter(Boolean).length;

  const step1State = statusFor(hasLawyer, canWork && isOpen, !canWork && !hasLawyer);
  const step2State = statusFor(isInProgress || isFinished, canWork && isOpen && hasLawyer, !hasLawyer || blockedFromActions);
  const step3State = statusFor(hasUpdates, canWork && isInProgress, !isInProgress && !isFinished);
  const step4State = statusFor(
    isFinished,
    canWork && isInProgress && hasUpdates && hasResolutionDocument,
    !hasUpdates || (isInProgress && !hasResolutionDocument) || blockedFromActions,
  );

  const lawyerDescription = hasLawyer
    ? `Responsable legal: ${lawyerNames.join(", ")}.`
    : canAssign
      ? "Aun no hay abogado asignado. Asigna un responsable desde Bandeja antes de iniciar desarrollo."
      : "Aun no hay abogado asignado. Un Jefe de Grupo o SuperAdmin debe asignar el responsable.";

  return (
    <section className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--gold)]">
            Flujo real del expediente
          </p>
          <h2 className="mt-1 text-base font-bold text-[var(--text)]">
            {completed}/4 pasos completados
          </h2>
        </div>
        <div className="w-full md:w-72 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(completed / 4) * 100}%`,
              background: isFinished ? "#10B981" : "var(--gold)",
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <StepCard
          number={1}
          title="Abogado asignado"
          icon={UserCheck}
          state={step1State}
          description={lawyerDescription}
          action={
            !hasLawyer && canAssign ? (
              <AnchorAction href="/admin/bandeja">Asignar en bandeja</AnchorAction>
            ) : null
          }
        />

        <StepCard
          number={2}
          title="Caso en desarrollo"
          icon={Clock}
          state={step2State}
          description={
            isInProgress || isFinished
              ? "El cliente ya ve el expediente como trabajo activo del equipo legal."
              : "Pasa el caso a desarrollo cuando el abogado ya va a comenzar la gestion real."
          }
          action={
            isOpen && hasLawyer && canWork ? (
              <AdvanceStageButton caseId={caseId} caseCode={caseCode} />
            ) : null
          }
        />

        <StepCard
          number={3}
          title="Avances registrados"
          icon={FileText}
          state={step3State}
          description={
            hasUpdates
              ? "Ya existe bitacora visible para el cliente. Puedes seguir agregando avances si corresponde."
              : "Registra el primer avance desde el formulario. El sistema exigira conteo activo antes de publicar."
          }
          action={
            isInProgress && canWork ? (
              <AnchorAction href="#registrar-avance">Registrar avance</AnchorAction>
            ) : null
          }
        />

        <StepCard
          number={4}
          title="Caso resuelto"
          icon={CheckCircle2}
          state={step4State}
          description={
            isFinished
              ? "El caso esta cerrado y el cliente puede descargar la resolucion final."
              : hasResolutionDocument
                ? "La resolucion final ya esta adjunta. Puedes finalizar y notificar al cliente."
                : "Antes de finalizar, adjunta un documento y marcalo como resolucion final del caso."
          }
          action={
            isInProgress && canWork ? (
              hasResolutionDocument ? (
                <FinishCaseButton caseId={caseId} caseCode={caseCode} />
              ) : (
                <AnchorAction href="#registrar-avance">Adjuntar resolucion</AnchorAction>
              )
            ) : null
          }
        />
      </div>
    </section>
  );
}
