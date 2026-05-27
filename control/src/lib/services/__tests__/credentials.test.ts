import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { generateSecurePassword, hashPassword } from "@/lib/services/credentials";

describe("credentials helpers", () => {
  describe("generateSecurePassword", () => {
    it("default length is 8", () => {
      expect(generateSecurePassword()).toHaveLength(8);
    });

    it("respects custom length", () => {
      expect(generateSecurePassword(12)).toHaveLength(12);
      expect(generateSecurePassword(16)).toHaveLength(16);
    });

    it("uses only safe alphabet (no 0/O/1/I)", () => {
      const safeAlphabet = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;
      for (let i = 0; i < 200; i++) {
        const pwd = generateSecurePassword();
        expect(pwd).toMatch(safeAlphabet);
        expect(pwd).not.toMatch(/[01OI]/);
      }
    });

    it("produces distinct values across calls (collisions extremely rare)", () => {
      const seen = new Set<string>();
      for (let i = 0; i < 500; i++) {
        seen.add(generateSecurePassword());
      }
      // Con alfabeto de 32 chars y longitud 8 → 32^8 ≈ 1.1e12 combinaciones.
      expect(seen.size).toBe(500);
    });
  });

  describe("hashPassword", () => {
    it("returns a bcrypt hash that verifies the original plaintext", async () => {
      const plain = "Y732HX";
      const hash = await hashPassword(plain);
      expect(hash).toMatch(/^\$2[aby]\$/);
      expect(await bcrypt.compare(plain, hash)).toBe(true);
    });

    it("uses cost factor 12", async () => {
      const hash = await hashPassword("any");
      const cost = parseInt(hash.split("$")[2], 10);
      expect(cost).toBe(12);
    });

    it("produces distinct hashes for the same plaintext (random salt)", async () => {
      const plain = "Y732HX";
      const h1 = await hashPassword(plain);
      const h2 = await hashPassword(plain);
      expect(h1).not.toBe(h2);
      expect(await bcrypt.compare(plain, h1)).toBe(true);
      expect(await bcrypt.compare(plain, h2)).toBe(true);
    });
  });
});
