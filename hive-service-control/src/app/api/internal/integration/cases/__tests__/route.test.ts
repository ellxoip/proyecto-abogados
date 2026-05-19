import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { POST } from "@/app/api/internal/integration/cases/route";
import { _prisma } from "@/lib/db/_client";

const ENDPOINT = "http://test/api/internal/integration/cases";

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
  password_plain: "Y732HX",
  case_code: "AT-2025-001",
  service_category: "DEUDA_EJECUTIVA",
  crm_lead_id: 42,
  correlation_id: "corr-001",
  initial_payment_amount: 250000,
  contrato_id_sis_contable: 123,
  payment_link: "https://pagacuotas.cl/c/abc123",
  source: "NEXIO",
  financials: {
    honorarios: 1500000,
    cuota_inicial: 250000,
    num_cuotas: 5,
    monto_cuota: 250000,
  },
  team: { vendedor: "Marcela", agendadora: "Camila" },
};

describe("POST /api/internal/integration/cases", () => {
  describe("auth", () => {
    it("returns 401 without API key", async () => {
      const res = await POST(buildRequest(validPayload, { authed: false }));
      expect(res.status).toBe(401);
    });
  });

  describe("validation", () => {
    it("returns 422 without password_plain", async () => {
      const { password_plain: _omit, ...partial } = validPayload;
      const res = await POST(buildRequest(partial));
      expect(res.status).toBe(422);
    });

    it("returns 422 without case_code", async () => {
      const { case_code: _omit, ...partial } = validPayload;
      const res = await POST(buildRequest(partial));
      expect(res.status).toBe(422);
    });

    it("returns 422 without email", async () => {
      const { email: _omit, ...partial } = validPayload;
      const res = await POST(buildRequest(partial));
      expect(res.status).toBe(422);
    });
  });

  describe("happy path — new client + new case", () => {
    it("returns 201 and creates client + case + audit", async () => {
      const res = await POST(buildRequest(validPayload));
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.wasCreated).toBe(true);

      const user = await _prisma.user.findFirst({ where: { rut: "21331955-8" } });
      expect(user).not.toBeNull();
      expect(user!.mustChangePassword).toBe(true);
      expect(await bcrypt.compare("Y732HX", user!.passwordHash)).toBe(true);

      const kase = await _prisma.case.findUnique({ where: { code: "AT-2025-001" } });
      expect(kase).not.toBeNull();
      expect(kase!.is_paid).toBe(true);
      expect(kase!.stage).toBe("OPEN");
      expect(kase!.client_id).toBe(user!.id);

      const meta = JSON.parse(kase!.metadata ?? "{}");
      expect(meta.source).toBe("NEXIO");
      expect(meta.crm_lead_id).toBe(42);
      expect(meta.financials.honorarios).toBe(1500000);

      const audit = await _prisma.auditLog.findFirst({
        where: { action: "PAYMENT_RECORDED", caseId: kase!.id },
      });
      expect(audit).not.toBeNull();
    });

    it("creates Category if missing", async () => {
      await POST(buildRequest(validPayload));
      const cat = await _prisma.category.findUnique({ where: { name: "DEUDA_EJECUTIVA" } });
      expect(cat).not.toBeNull();
    });

    it("falls back to OTRO when service_category is null", async () => {
      const { service_category: _omit, ...partial } = validPayload;
      await POST(buildRequest({ ...partial, service_category: null }));
      const cat = await _prisma.category.findUnique({ where: { name: "OTRO" } });
      expect(cat).not.toBeNull();
    });
  });

  describe("idempotency", () => {
    it("returns 200 on second call with same case_code (no duplicates)", async () => {
      const first = await POST(buildRequest(validPayload));
      expect(first.status).toBe(201);
      const second = await POST(buildRequest(validPayload));
      expect(second.status).toBe(200);

      const cases = await _prisma.case.findMany({ where: { code: "AT-2025-001" } });
      expect(cases).toHaveLength(1);
      const users = await _prisma.user.count({ where: { rut: "21331955-8" } });
      expect(users).toBe(1);
    });

    it("merges metadata on update without losing previous keys", async () => {
      await POST(buildRequest(validPayload));
      await POST(buildRequest({
        ...validPayload,
        initial_payment_amount: 500000,
        correlation_id: "corr-002",
      }));

      const kase = await _prisma.case.findUnique({ where: { code: "AT-2025-001" } });
      const meta = JSON.parse(kase!.metadata ?? "{}");
      expect(meta.initial_payment_amount).toBe(500000);
      expect(meta.correlation_id).toBe("corr-002");
      // El payload original sigue presente (source/crm_lead_id no se borran).
      expect(meta.source).toBe("NEXIO");
      expect(meta.crm_lead_id).toBe(42);
    });

    it("re-syncs hash when client still has temporary password", async () => {
      await POST(buildRequest(validPayload));
      await POST(buildRequest({ ...validPayload, password_plain: "OTRA9999" }));

      const user = await _prisma.user.findFirst({ where: { rut: "21331955-8" } });
      expect(await bcrypt.compare("OTRA9999", user!.passwordHash)).toBe(true);
      expect(user!.mustChangePassword).toBe(true);
    });

    it("preserves rotated password (mustChangePassword=false → hash never touched)", async () => {
      await POST(buildRequest(validPayload));
      const ownHash = await bcrypt.hash("MiClaveSegura1", 12);
      await _prisma.user.update({
        where: { rut: "21331955-8" },
        data: { passwordHash: ownHash, mustChangePassword: false },
      });

      const res = await POST(buildRequest({ ...validPayload, password_plain: "INTENTO99" }));
      expect(res.status).toBe(200);

      const user = await _prisma.user.findFirst({ where: { rut: "21331955-8" } });
      expect(user!.passwordHash).toBe(ownHash);
      expect(user!.mustChangePassword).toBe(false);
      expect(await bcrypt.compare("MiClaveSegura1", user!.passwordHash)).toBe(true);
    });
  });

  describe("work_order attachment", () => {
    it("attaches OT as Update with document_url", async () => {
      const payloadWithOT = {
        ...validPayload,
        work_order: {
          id: 99,
          type: "DEMANDA_INICIAL",
          status: "OPEN",
          created_at: "2025-05-10T12:00:00Z",
          document_url: "https://nexio.cl/docs/ot-99.pdf",
          fields: { abogado: "Juan", urgencia: "alta" },
        },
      };

      const res = await POST(buildRequest(payloadWithOT));
      expect(res.status).toBe(201);

      const updates = await _prisma.update.findMany();
      expect(updates).toHaveLength(1);
      expect(updates[0].document_url).toBe("https://nexio.cl/docs/ot-99.pdf");
      expect(updates[0].description).toContain("[OT/DEUDA_EJECUTIVA] DEMANDA_INICIAL");
      expect(updates[0].description).toContain("abogado: Juan");
    });

    it("does not duplicate same OT on idempotent re-send", async () => {
      const payloadWithOT = {
        ...validPayload,
        work_order: {
          id: 99,
          type: "DEMANDA_INICIAL",
          created_at: "2025-05-10T12:00:00Z",
          document_url: "https://nexio.cl/docs/ot-99.pdf",
        },
      };
      await POST(buildRequest(payloadWithOT));
      await POST(buildRequest(payloadWithOT));
      const updates = await _prisma.update.findMany();
      expect(updates).toHaveLength(1);
    });
  });
});
