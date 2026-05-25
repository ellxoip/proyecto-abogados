import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { POST } from "@/app/api/internal/integration/clients/payment-link/route";
import { _prisma } from "@/lib/db/_client";

const ENDPOINT = "http://test/api/internal/integration/clients/payment-link";

function buildRequest(body: unknown, opts: { authed?: boolean } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.authed !== false) headers["x-api-key"] = "test-internal-key";
  return new Request(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const validPayload = {
  rut: "21.331.955-8",
  nombre: "Matias Villalobos",
  email: "matias.villalobos@hashtagcl.com",
  telefono: "+56986173914",
  payment_link: "https://pagacuotas.cl/c/abc123",
  password_plain: "Y732HX",
  crm_lead_id: 42,
  correlation_id: "corr-001",
};

describe("POST /api/internal/integration/clients/payment-link", () => {
  describe("auth", () => {
    it("returns 401 without API key", async () => {
      const res = await POST(buildRequest(validPayload, { authed: false }));
      expect(res.status).toBe(401);
    });

    it("accepts Authorization: Bearer", async () => {
      const req = new Request(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-internal-key",
        },
        body: JSON.stringify(validPayload),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });

  describe("validation", () => {
    it("returns 422 without password_plain", async () => {
      const { password_plain: _omit, ...partial } = validPayload;
      const res = await POST(buildRequest(partial));
      expect(res.status).toBe(422);
    });

    it("returns 422 with invalid email", async () => {
      const res = await POST(buildRequest({ ...validPayload, email: "not-an-email" }));
      expect(res.status).toBe(422);
    });

    it("returns 422 with non-URL payment_link", async () => {
      const res = await POST(buildRequest({ ...validPayload, payment_link: "not-a-url" }));
      expect(res.status).toBe(422);
    });

    it("returns 400 with malformed JSON body", async () => {
      const req = new Request(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": "test-internal-key" },
        body: "{not json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe("happy path — new client", () => {
    it("creates User with hash that verifies password_plain", async () => {
      const res = await POST(buildRequest(validPayload));
      expect(res.status).toBe(200);

      const user = await _prisma.user.findFirst({
        where: { rut: "21331955-8" },
      });
      expect(user).not.toBeNull();
      expect(user!.email).toBe("matias.villalobos@hashtagcl.com");
      expect(user!.paymentLink).toBe(validPayload.payment_link);
      // El cliente ya conoce su clave desde PagaCuotas; no se fuerza rotación.
      expect(user!.mustChangePassword).toBe(false);
      expect(user!.active).toBe(true);

      const matches = await bcrypt.compare("Y732HX", user!.passwordHash);
      expect(matches).toBe(true);
    });

    it("normalizes RUT (strips dots, lowercases)", async () => {
      await POST(buildRequest({ ...validPayload, rut: "21.331.955-8" }));
      const user = await _prisma.user.findFirst({ where: { rut: "21331955-8" } });
      expect(user).not.toBeNull();
    });

    it("normalizes email to lowercase", async () => {
      await POST(buildRequest({ ...validPayload, email: "MATIAS@HASHTAGCL.COM" }));
      const user = await _prisma.user.findFirst({ where: { email: "matias@hashtagcl.com" } });
      expect(user).not.toBeNull();
    });
  });

  describe("idempotency", () => {
    it("re-syncs hash on every call (fc is source of truth via bidirectional sync)", async () => {
      await POST(buildRequest(validPayload));
      const firstHash = (await _prisma.user.findFirst({ where: { rut: "21331955-8" } }))!.passwordHash;

      await POST(buildRequest({ ...validPayload, password_plain: "NEWPASS9" }));
      const after = await _prisma.user.findFirst({ where: { rut: "21331955-8" } });

      expect(after!.passwordHash).not.toBe(firstHash);
      expect(await bcrypt.compare("NEWPASS9", after!.passwordHash)).toBe(true);
      expect(after!.mustChangePassword).toBe(false);
    });

    it("preserves passwordHash when User already rotated (PASSWORD_CHANGED audit exists)", async () => {
      // Cliente onboardeado, luego rotó su clave en PagaCuotas — sync
      // bidireccional dejó el hash vigente en sc.User. Una llamada
      // posterior de payment-link no debe pisar ese hash con la clave
      // ORIGINAL (snapshot que fc guarda del onboarding).
      await POST(buildRequest(validPayload));
      const initialUser = await _prisma.user.findFirst({ where: { rut: "21331955-8" } });
      const rotatedHash = await bcrypt.hash("ROTADA1", 12);
      await _prisma.user.update({
        where: { id: initialUser!.id },
        data: { passwordHash: rotatedHash },
      });
      await _prisma.auditLog.create({
        data: {
          action: "PASSWORD_CHANGED",
          actorId: initialUser!.id,
          message: "Contraseña sincronizada desde PagaCuotas (auto-login).",
        },
      });

      const res = await POST(buildRequest(validPayload));
      expect(res.status).toBe(200);

      const after = await _prisma.user.findFirst({ where: { rut: "21331955-8" } });
      expect(after!.passwordHash).toBe(rotatedHash);
      expect(await bcrypt.compare("ROTADA1", after!.passwordHash)).toBe(true);
      expect(await bcrypt.compare("Y732HX", after!.passwordHash)).toBe(false);
    });

    it("overwrites identity (fullName/email/phone) on reused RUT (e.g. demo user)", async () => {
      // Demo/seed con mismo RUT no debe secuestrar identidad del cliente real.
      await _prisma.user.create({
        data: {
          fullName: "Demo Viejo",
          email: "demo.viejo@hivecontrol.cl",
          phone: "+56900000000",
          role: "CLIENTE",
          passwordHash: await bcrypt.hash("demoseed", 12),
          rut: "21331955-8",
          mustChangePassword: false,
          active: true,
        },
      });

      const res = await POST(buildRequest(validPayload));
      expect(res.status).toBe(200);

      const user = await _prisma.user.findFirst({ where: { rut: "21331955-8" } });
      expect(user!.fullName).toBe("Matias Villalobos");
      expect(user!.email).toBe("matias.villalobos@hashtagcl.com");
      expect(user!.phone).toBe("+56986173914");
      expect(await bcrypt.compare("Y732HX", user!.passwordHash)).toBe(true);
    });

    it("does not duplicate users on repeated calls", async () => {
      await POST(buildRequest(validPayload));
      await POST(buildRequest(validPayload));
      await POST(buildRequest(validPayload));
      const count = await _prisma.user.count({ where: { rut: "21331955-8" } });
      expect(count).toBe(1);
    });

    it("updates paymentLink when financial regenerates the link", async () => {
      await POST(buildRequest(validPayload));
      const newLink = "https://pagacuotas.cl/c/regenerated-xyz";
      await POST(buildRequest({ ...validPayload, payment_link: newLink }));

      const after = await _prisma.user.findFirst({ where: { rut: "21331955-8" } });
      expect(after!.paymentLink).toBe(newLink);
    });
  });

  describe("audit", () => {
    it("writes a PAYMENT_RECORDED audit log", async () => {
      await POST(buildRequest(validPayload));
      const log = await _prisma.auditLog.findFirst({
        where: { action: "PAYMENT_RECORDED" },
        orderBy: { createdAt: "desc" },
      });
      expect(log).not.toBeNull();
      expect(log!.message).toContain("PagaCuotas");
    });
  });
});
