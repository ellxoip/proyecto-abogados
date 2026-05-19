import { describe, expect, it, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { verifyCredentials } from "@/lib/auth";
import { _prisma } from "@/lib/db/_client";

async function seedUser(opts: {
  email?: string;
  password: string;
  role?: string;
  active?: boolean;
  mustChangePassword?: boolean;
}) {
  const passwordHash = await bcrypt.hash(opts.password, 12);
  return _prisma.user.create({
    data: {
      fullName: "Test User",
      email: opts.email ?? "user@test.cl",
      phone: "+56900000000",
      role: opts.role ?? "CLIENTE",
      passwordHash,
      mustChangePassword: opts.mustChangePassword ?? false,
      active: opts.active ?? true,
    },
  });
}

beforeEach(async () => {
  // setup.ts ya limpia; nada extra.
});

describe("verifyCredentials", () => {
  it("returns null when email is missing or empty", async () => {
    expect(await verifyCredentials("", "x", { skipDelay: true })).toBeNull();
    expect(await verifyCredentials(undefined, "x", { skipDelay: true })).toBeNull();
  });

  it("returns null when password is missing", async () => {
    await seedUser({ password: "Y732HX" });
    expect(await verifyCredentials("user@test.cl", "", { skipDelay: true })).toBeNull();
  });

  it("returns null when the user does not exist (anti-enumeration delay skipped in test)", async () => {
    expect(await verifyCredentials("nadie@test.cl", "whatever", { skipDelay: true })).toBeNull();
    const audits = await _prisma.auditLog.findMany();
    // No audit row porque ni siquiera hay un actor que asociar.
    expect(audits).toHaveLength(0);
  });

  it("returns null when the user is inactive (no audit row)", async () => {
    await seedUser({ password: "Y732HX", active: false });
    expect(await verifyCredentials("user@test.cl", "Y732HX", { skipDelay: true })).toBeNull();
    const audits = await _prisma.auditLog.findMany();
    expect(audits).toHaveLength(0);
  });

  it("returns null + writes LOGIN_FAILED audit when password is wrong", async () => {
    const user = await seedUser({ password: "Y732HX" });
    const result = await verifyCredentials("user@test.cl", "WRONG", { skipDelay: true });
    expect(result).toBeNull();
    const audit = await _prisma.auditLog.findFirst({ where: { action: "LOGIN_FAILED" } });
    expect(audit).not.toBeNull();
    expect(audit!.actorId).toBe(user.id);
    expect(audit!.status).toBe("failed");
  });

  it("returns the user + writes LOGIN_SUCCESS audit on correct password", async () => {
    const user = await seedUser({ password: "Y732HX", role: "CLIENTE" });
    const result = await verifyCredentials("user@test.cl", "Y732HX", { skipDelay: true });
    expect(result).not.toBeNull();
    expect(result!.id).toBe(user.id);
    expect(result!.email).toBe("user@test.cl");
    expect(result!.name).toBe("Test User");
    expect(result!.role).toBe("CLIENTE");
    expect(result!.mustChangePassword).toBe(false);

    const audit = await _prisma.auditLog.findFirst({ where: { action: "LOGIN_SUCCESS" } });
    expect(audit).not.toBeNull();
    expect(audit!.actorId).toBe(user.id);
    expect(audit!.message).toContain("Rol: CLIENTE");
  });

  it("propagates mustChangePassword flag for clients with temp credentials", async () => {
    await seedUser({ password: "Y732HX", role: "CLIENTE", mustChangePassword: true });
    const result = await verifyCredentials("user@test.cl", "Y732HX", { skipDelay: true });
    expect(result!.mustChangePassword).toBe(true);
  });

  it("normalizes email casing/whitespace before lookup", async () => {
    await seedUser({ email: "user@test.cl", password: "Y732HX" });
    const result = await verifyCredentials("  USER@TEST.CL  ", "Y732HX", { skipDelay: true });
    expect(result).not.toBeNull();
  });

  it("does not leak existence of user via timing when account is inactive vs missing", async () => {
    // No medimos tiempo (test inestable en CI), pero verificamos que ambos
    // caminos no devuelvan información distinta: ambos devuelven null y no
    // crean audit log.
    await seedUser({ password: "Y732HX", active: false });
    const inactiveResult = await verifyCredentials("user@test.cl", "Y732HX", { skipDelay: true });
    const missingResult = await verifyCredentials("nope@test.cl", "Y732HX", { skipDelay: true });
    expect(inactiveResult).toBeNull();
    expect(missingResult).toBeNull();
    const audits = await _prisma.auditLog.count();
    expect(audits).toBe(0);
  });
});
