import { describe, expect, it, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { _prisma } from "@/lib/db/_client";

// Mockeamos auth() para devolver una sesión controlada por test.
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
}));

// Importamos DESPUÉS del mock para que el module factory ya esté en scope.
const { changeOwnPassword } = await import("@/app/portal/cambiar-password/actions");

async function seedClient(opts: {
  email?: string;
  password: string;
  mustChangePassword?: boolean;
  active?: boolean;
}) {
  const passwordHash = await bcrypt.hash(opts.password, 12);
  return _prisma.user.create({
    data: {
      fullName: "Matias Villalobos",
      email: opts.email ?? "matias@hashtagcl.com",
      phone: "+56986173914",
      role: "CLIENTE",
      passwordHash,
      rut: "21331955-8",
      mustChangePassword: opts.mustChangePassword ?? true,
      active: opts.active ?? true,
    },
  });
}

beforeEach(() => {
  authMock.mockReset();
});

describe("changeOwnPassword", () => {
  it("rechaza sin sesión", async () => {
    authMock.mockResolvedValue(null);
    const r = await changeOwnPassword({
      currentPassword: "x",
      newPassword: "Segura1234",
      confirmPassword: "Segura1234",
    });
    expect(r).toEqual({ ok: false, error: "Sesión expirada." });
  });

  it("rechaza si falta algún campo", async () => {
    const user = await seedClient({ password: "Y732HX" });
    authMock.mockResolvedValue({ user: { id: user.id, role: "CLIENTE" } });

    const r = await changeOwnPassword({
      currentPassword: "",
      newPassword: "Segura1234",
      confirmPassword: "Segura1234",
    });
    expect(r).toEqual({ ok: false, error: "Completa todos los campos." });
  });

  it("rechaza si confirm no coincide", async () => {
    const user = await seedClient({ password: "Y732HX" });
    authMock.mockResolvedValue({ user: { id: user.id, role: "CLIENTE" } });

    const r = await changeOwnPassword({
      currentPassword: "Y732HX",
      newPassword: "Segura1234",
      confirmPassword: "Segura9999",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/confirmación/i);
  });

  it("rechaza password débil (sin letra)", async () => {
    const user = await seedClient({ password: "Y732HX" });
    authMock.mockResolvedValue({ user: { id: user.id, role: "CLIENTE" } });

    const r = await changeOwnPassword({
      currentPassword: "Y732HX",
      newPassword: "12345678",
      confirmPassword: "12345678",
    });
    expect(r.ok).toBe(false);
  });

  it("rechaza password débil (sin número)", async () => {
    const user = await seedClient({ password: "Y732HX" });
    authMock.mockResolvedValue({ user: { id: user.id, role: "CLIENTE" } });

    const r = await changeOwnPassword({
      currentPassword: "Y732HX",
      newPassword: "soloLetras",
      confirmPassword: "soloLetras",
    });
    expect(r.ok).toBe(false);
  });

  it("rechaza password muy corta", async () => {
    const user = await seedClient({ password: "Y732HX" });
    authMock.mockResolvedValue({ user: { id: user.id, role: "CLIENTE" } });

    const r = await changeOwnPassword({
      currentPassword: "Y732HX",
      newPassword: "Abc1",
      confirmPassword: "Abc1",
    });
    expect(r.ok).toBe(false);
  });

  it("rechaza si la nueva es igual a la actual", async () => {
    const user = await seedClient({ password: "MismaPass1" });
    authMock.mockResolvedValue({ user: { id: user.id, role: "CLIENTE" } });

    const r = await changeOwnPassword({
      currentPassword: "MismaPass1",
      newPassword: "MismaPass1",
      confirmPassword: "MismaPass1",
    });
    expect(r.ok).toBe(false);
  });

  it("rechaza si la actual no es correcta", async () => {
    const user = await seedClient({ password: "Y732HX" });
    authMock.mockResolvedValue({ user: { id: user.id, role: "CLIENTE" } });

    const r = await changeOwnPassword({
      currentPassword: "MalaActual",
      newPassword: "Segura1234",
      confirmPassword: "Segura1234",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/actual no es correcta/);
  });

  it("rota password, baja flag mustChangePassword y deja auditoría", async () => {
    const user = await seedClient({ password: "Y732HX" });
    authMock.mockResolvedValue({ user: { id: user.id, role: "CLIENTE" } });

    const r = await changeOwnPassword({
      currentPassword: "Y732HX",
      newPassword: "ClaveNueva9",
      confirmPassword: "ClaveNueva9",
    });
    expect(r).toEqual({ ok: true });

    const after = await _prisma.user.findUnique({ where: { id: user.id } });
    expect(after!.mustChangePassword).toBe(false);
    expect(await bcrypt.compare("ClaveNueva9", after!.passwordHash)).toBe(true);
    expect(await bcrypt.compare("Y732HX", after!.passwordHash)).toBe(false);

    const audit = await _prisma.auditLog.findFirst({
      where: { action: "PASSWORD_CHANGED", actorId: user.id },
    });
    expect(audit).not.toBeNull();
  });

  it("rechaza si la cuenta está inactiva", async () => {
    const user = await seedClient({ password: "Y732HX", active: false });
    authMock.mockResolvedValue({ user: { id: user.id, role: "CLIENTE" } });

    const r = await changeOwnPassword({
      currentPassword: "Y732HX",
      newPassword: "ClaveNueva9",
      confirmPassword: "ClaveNueva9",
    });
    expect(r.ok).toBe(false);
  });
});
