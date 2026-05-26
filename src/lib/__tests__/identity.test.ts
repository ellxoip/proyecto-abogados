import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone, normalizeRut } from "@/lib/identity";

describe("identity helpers", () => {
  describe("normalizeRut", () => {
    it("strips dots, lowercases, trims", () => {
      expect(normalizeRut("21.331.955-K")).toBe("21331955-k");
      expect(normalizeRut("  12.345.678-9  ")).toBe("12345678-9");
      expect(normalizeRut("99999999-K")).toBe("99999999-k");
    });

    it("returns empty for nullish", () => {
      expect(normalizeRut(null)).toBe("");
      expect(normalizeRut(undefined)).toBe("");
      expect(normalizeRut("")).toBe("");
    });

    it("idempotent: already-normalized stays the same", () => {
      const once = normalizeRut("21.331.955-K");
      expect(normalizeRut(once)).toBe(once);
    });
  });

  describe("normalizeEmail", () => {
    it("lowercases + trims", () => {
      expect(normalizeEmail("  USER@TEST.CL  ")).toBe("user@test.cl");
    });
    it("preserves +aliases", () => {
      expect(normalizeEmail("Carlos+OT@Hashtagcl.com")).toBe("carlos+ot@hashtagcl.com");
    });
    it("returns empty for nullish", () => {
      expect(normalizeEmail(null)).toBe("");
      expect(normalizeEmail(undefined)).toBe("");
    });
  });

  describe("normalizePhone", () => {
    it("strips spaces, parens, hyphens", () => {
      expect(normalizePhone("+56 9 8617 3914")).toBe("+56986173914");
      expect(normalizePhone("(+56) 9-8617.3914")).toBe("+56986173914");
    });
    it("keeps a single leading +", () => {
      expect(normalizePhone("+56986173914")).toBe("+56986173914");
    });
    it("returns empty for nullish", () => {
      expect(normalizePhone(null)).toBe("");
    });
  });
});
