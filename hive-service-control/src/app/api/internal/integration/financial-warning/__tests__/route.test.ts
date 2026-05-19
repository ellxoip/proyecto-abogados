import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { POST } from "@/app/api/internal/integration/financial-warning/route";
import { _prisma } from "@/lib/db/_client";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const enqueueWhatsAppMock = vi.fn();
const enqueueEmailMock = vi.fn();
vi.mock("@/lib/notifications", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notifications")>("@/lib/notifications");
  return {
    ...actual,
    enqueueWhatsApp: (...args: any[]) => enqueueWhatsAppMock(...args),
    enqueueEmail: (...args: any[]) => enqueueEmailMock(...args),
  };
});

const URL = "http://test/api/internal/integration/financial-warning";

function authed(body: unknown, key = "test-internal-key") {
  return new Request(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify(body),
  });
}

async function seedClienteConCaso(opts: { rut?: string; stage?: string; active?: boolean } = {}) {
  const passwordHash = await bcrypt.hash("Y732HX", 12);
  const cliente = await _prisma.user.create({
    data: {
      fullName: "Cliente Mora",
      email: "mora@test.cl",
      phone: "+56900000044",
      role: "CLIENTE",
      passwordHash,
      rut: opts.rut ?? "21331955-8",
      mustChangePassword: false,
      active: opts.active ?? true,
    },
  });
  const cat = await _prisma.category.create({ data: { name: "OTRO-MORA" } });
  const kase = await _prisma.case.create({
    data: {
      code: `AT-MORA-${Math.random().toString(36).slice(2, 8)}`,
      client_id: cliente.id,
      categoryId: cat.id,
      stage: opts.stage ?? "IN_PROGRESS",
      is_paid: true,
    },
  });
  return { cliente, kase };
}

const payloadBase = {
  source: "hive-financial-control",
  warning_id: 1,
  dias_atraso: 10,
  cliente: {
    id: 1,
    rut: "21331955-8",
    nombre: "Cliente Mora",
    email: "mora@test.cl",
    telefono: "+56900000044",
  },
  contrato: { id: 7001, external_id: "C-7001", estado: "ACTIVO" },
  cuota: { id: 999, numero_cuota: 1, fecha_vencimiento: "2025-04-15" },
};

describe("POST /api/internal/integration/financial-warning", () => {
  it("401 sin API key", async () => {
    const res = await POST(
      new Request(URL, { method: "POST", body: JSON.stringify({}) }),
    );
    expect(res.status).toBe(401);
  });

  it("422 con level inválido", async () => {
    const res = await POST(authed({ ...payloadBase, level: "WARNING_99" }));
    expect(res.status).toBe(422);
  });

  it("202 cuando el cliente no existe en service-control", async () => {
    enqueueWhatsAppMock.mockReset();
    const res = await POST(authed({ ...payloadBase, level: "WARNING_10" }));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.matched).toBe(false);
    expect(enqueueWhatsAppMock).not.toHaveBeenCalled();
  });

  it("WARNING_10 encola WhatsApp + Email y deja audit", async () => {
    enqueueWhatsAppMock.mockReset();
    enqueueEmailMock.mockReset();
    const { kase } = await seedClienteConCaso();

    const res = await POST(authed({ ...payloadBase, level: "WARNING_10" }));
    expect(res.status).toBe(200);

    expect(enqueueWhatsAppMock).toHaveBeenCalledWith({ kind: "non_payment_warning", caseId: kase.id });
    expect(enqueueEmailMock).toHaveBeenCalledWith({ kind: "non_payment_warning", caseId: kase.id });

    const audit = await _prisma.auditLog.findFirst({
      where: { action: "EMAIL_SENT", caseId: kase.id },
    });
    expect(audit).not.toBeNull();
    expect(audit!.message).toMatch(/Warning 10/);
  });

  it("WARNING_20 encola aviso crítico", async () => {
    enqueueWhatsAppMock.mockReset();
    enqueueEmailMock.mockReset();
    const { kase } = await seedClienteConCaso();

    const res = await POST(authed({ ...payloadBase, level: "WARNING_20", dias_atraso: 20 }));
    expect(res.status).toBe(200);
    expect(enqueueWhatsAppMock).toHaveBeenCalledWith({ kind: "overdue_notice", caseId: kase.id });
    expect(enqueueEmailMock).toHaveBeenCalledWith({ kind: "overdue_notice", caseId: kase.id });
  });

  it("WARNING_30 halta el caso y desactiva al cliente", async () => {
    enqueueWhatsAppMock.mockReset();
    enqueueEmailMock.mockReset();
    const { cliente, kase } = await seedClienteConCaso();

    const res = await POST(authed({ ...payloadBase, level: "WARNING_30", dias_atraso: 30 }));
    expect(res.status).toBe(200);

    const after = await _prisma.case.findUnique({ where: { id: kase.id } });
    expect(after!.stage).toBe("HALTED_BY_PAYMENT");
    expect(after!.halted_at).not.toBeNull();

    const clienteAfter = await _prisma.user.findUnique({ where: { id: cliente.id } });
    expect(clienteAfter!.active).toBe(false);

    const audit = await _prisma.auditLog.findFirst({
      where: { action: "CASE_HALTED", caseId: kase.id },
    });
    expect(audit).not.toBeNull();
  });

  it("WARNING_30 defensivo: caso ya HALTED solo reenvía notificación sin re-haltear", async () => {
    enqueueWhatsAppMock.mockReset();
    const { cliente, kase } = await seedClienteConCaso({ stage: "HALTED_BY_PAYMENT", active: false });

    const res = await POST(authed({ ...payloadBase, level: "WARNING_30" }));
    expect(res.status).toBe(200);

    // El caso ya estaba HALTED, no debe duplicar halted_at.
    const after = await _prisma.case.findUnique({ where: { id: kase.id } });
    expect(after!.stage).toBe("HALTED_BY_PAYMENT");

    // Cliente sigue inactivo (no se reactiva, no se duplica desactivación).
    const clienteAfter = await _prisma.user.findUnique({ where: { id: cliente.id } });
    expect(clienteAfter!.active).toBe(false);

    expect(enqueueWhatsAppMock).toHaveBeenCalledWith({ kind: "overdue_notice", caseId: kase.id });
  });
});
