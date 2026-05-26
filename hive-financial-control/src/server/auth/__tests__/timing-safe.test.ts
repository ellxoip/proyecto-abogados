import { describe, expect, it } from "vitest";
import { safeEqual } from "../timing-safe";

describe("safeEqual", () => {
  it("true para strings idénticos", () => {
    expect(safeEqual("abc-123", "abc-123")).toBe(true);
  });

  it("false para strings distintos misma longitud", () => {
    expect(safeEqual("aaaa", "aaab")).toBe(false);
  });

  it("false para longitudes distintas (no lanza)", () => {
    expect(safeEqual("a", "ab")).toBe(false);
    expect(safeEqual("ab", "a")).toBe(false);
  });

  it("false para strings vacíos vs no vacíos", () => {
    expect(safeEqual("", "x")).toBe(false);
    expect(safeEqual("x", "")).toBe(false);
  });

  it("true para dos strings vacíos", () => {
    expect(safeEqual("", "")).toBe(true);
  });

  it("soporta UTF-8 multi-byte", () => {
    expect(safeEqual("clavé-ñ", "clavé-ñ")).toBe(true);
    expect(safeEqual("clavé-ñ", "clave-ñ")).toBe(false);
  });
});
