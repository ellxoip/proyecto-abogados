import { describe, expect, it } from "vitest";
import { safeEqual } from "@/lib/timing-safe";

describe("safeEqual", () => {
  it("returns true for equal strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("", "")).toBe(true);
    expect(safeEqual("hola-mundo", "hola-mundo")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("aaaa", "bbbb")).toBe(false);
  });

  it("returns false for strings of different length (without crashing on buffer mismatch)", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("abcd", "abc")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });

  it("supports UTF-8 multibyte characters", () => {
    expect(safeEqual("clave-ñoño", "clave-ñoño")).toBe(true);
    expect(safeEqual("clave-ñoño", "clave-nono")).toBe(false);
  });
});
