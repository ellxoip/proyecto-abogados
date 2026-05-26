import { describe, expect, it } from "vitest";
import { canTransition, STATE_MACHINE } from "@/lib/case-health";
import { CaseStage } from "@/lib/db-enums";

describe("case-health state machine", () => {
  describe("canTransition", () => {
    it("OPEN → IN_PROGRESS is allowed", () => {
      expect(canTransition(CaseStage.OPEN, CaseStage.IN_PROGRESS)).toBe(true);
    });

    it("OPEN → HALTED_BY_PAYMENT is allowed", () => {
      expect(canTransition(CaseStage.OPEN, CaseStage.HALTED_BY_PAYMENT)).toBe(true);
    });

    it("OPEN → WAITING_CUOTAS is allowed", () => {
      expect(canTransition(CaseStage.OPEN, CaseStage.WAITING_CUOTAS)).toBe(true);
    });

    it("OPEN → FINISHED is NOT allowed (must pass through IN_PROGRESS)", () => {
      expect(canTransition(CaseStage.OPEN, CaseStage.FINISHED)).toBe(false);
    });

    it("IN_PROGRESS → FINISHED is allowed", () => {
      expect(canTransition(CaseStage.IN_PROGRESS, CaseStage.FINISHED)).toBe(true);
    });

    it("IN_PROGRESS → HALTED_BY_PAYMENT is allowed", () => {
      expect(canTransition(CaseStage.IN_PROGRESS, CaseStage.HALTED_BY_PAYMENT)).toBe(true);
    });

    it("IN_PROGRESS → OPEN is NOT allowed (no rollback)", () => {
      expect(canTransition(CaseStage.IN_PROGRESS, CaseStage.OPEN)).toBe(false);
    });

    it("FINISHED is a terminal state", () => {
      expect(STATE_MACHINE[CaseStage.FINISHED]).toEqual([]);
      expect(canTransition(CaseStage.FINISHED, CaseStage.IN_PROGRESS)).toBe(false);
      expect(canTransition(CaseStage.FINISHED, CaseStage.OPEN)).toBe(false);
    });

    it("HALTED_BY_PAYMENT can be reactivated to IN_PROGRESS or OPEN", () => {
      expect(canTransition(CaseStage.HALTED_BY_PAYMENT, CaseStage.IN_PROGRESS)).toBe(true);
      expect(canTransition(CaseStage.HALTED_BY_PAYMENT, CaseStage.OPEN)).toBe(true);
    });

    it("HALTED_BY_PAYMENT cannot jump directly to FINISHED", () => {
      expect(canTransition(CaseStage.HALTED_BY_PAYMENT, CaseStage.FINISHED)).toBe(false);
    });

    it("WAITING_CUOTAS can transition back to OPEN or forward to IN_PROGRESS", () => {
      expect(canTransition(CaseStage.WAITING_CUOTAS, CaseStage.OPEN)).toBe(true);
      expect(canTransition(CaseStage.WAITING_CUOTAS, CaseStage.IN_PROGRESS)).toBe(true);
      expect(canTransition(CaseStage.WAITING_CUOTAS, CaseStage.HALTED_BY_PAYMENT)).toBe(true);
    });

    it("returns false for unknown stages", () => {
      expect(canTransition("WHATEVER" as never, CaseStage.OPEN)).toBe(false);
    });
  });
});
