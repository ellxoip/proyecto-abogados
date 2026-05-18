import { CaseStage } from "@/lib/db-enums";
import { getStageMessage } from "@/lib/case-health";
import { Shield, Clock } from "lucide-react";
import { UploadReceiptButton } from "./UploadReceiptButton";

type Props = {
  stage: CaseStage;
  reason?: string | null;
  haltedAt?: Date | null;
  caseId?: string;
  children: React.ReactNode;
};

/**
 * Legal OS v3.0 - Result-Oriented Halted Overlay
 * 
 * Wraps any case-action surface. When the case is HALTED_BY_PAYMENT or WAITING_CUOTAS,
 * renders a result-oriented overlay focused on "Protecting your progress" rather than
 * technical blocking messages.
 * 
 * Includes manual receipt upload option for clients to expedite review.
 */
export function HaltedOverlay({ stage, reason, haltedAt, caseId, children }: Props) {
  // Only show overlay for blocked states
  if (stage !== CaseStage.HALTED_BY_PAYMENT && stage !== CaseStage.WAITING_CUOTAS) {
    return <>{children}</>;
  }

  const message = getStageMessage(stage);
  const isHalted = stage === CaseStage.HALTED_BY_PAYMENT;

  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none opacity-40 select-none">
        {children}
      </div>
      <div
        role="alert"
        className="absolute inset-0 flex items-center justify-center bg-[var(--surface-2)]/95 border-2 border-[#F87171] rounded-lg"
      >
        <div className="text-center max-w-md p-6">
          {/* Result-oriented icon */}
          <div className="w-14 h-14 rounded-full bg-[#F8717110] flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-[#F87171]" />
          </div>
          
          {/* Result-oriented title */}
          <h2 className="text-xl font-bold text-[var(--text)] font-serif mb-2">
            {message.title}
          </h2>
          
          {/* Result-oriented description */}
          <p className="text-sm text-[var(--text-muted)] mb-4">
            {message.description}
          </p>
          
          {/* Technical reason (secondary) */}
          {reason && (
            <p className="text-xs text-[#6B7280] mb-4">
              {reason}
            </p>
          )}
          
          {/* Action buttons */}
          <div className="flex flex-col gap-3 mt-6">
            {/* Upload receipt button for clients */}
            {isHalted && caseId && (
              <UploadReceiptButton caseId={caseId} />
            )}
            
            {/* Info about automatic reactivation */}
            <div className="flex items-center justify-center gap-2 text-xs text-[#6B7280]">
              <Clock className="w-3 h-3" />
              <span>La reactivación es automática una vez validado el pago</span>
            </div>
          </div>
          
          {haltedAt && (
            <p className="text-[11px] text-[#6B7280] mt-4">
              En pausa desde: {new Date(haltedAt).toLocaleDateString("es-CL")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
