import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { _prisma } from "@/lib/db/_client";

/**
 * E2E del gate "iniciar conteo antes de publicar avance" en
 * `postUpdate` (server action) que se gatilla desde la caja
 * `Registrar Avance del Caso`.
 *
 * Regla de negocio:
 *   - ABOGADO solo puede publicar un Update si tiene una `TimerSession`
 *     `status=ACTIVE` para ESE mismo `caseId`.
 *   - JEFE_DE_MESA y SUPER_ADMIN están exentos del gate.
 *   - CLIENTE no puede publicar avances (gate previo de rol).
 *   - El gate corre DESPUÉS de `assertCaseActive` → si el caso está
 *     HALTED_BY_PAYMENT, falla por "halted" aunque haya timer.
 *
 * UI complementaria (`UpdateForm.tsx`) hace una pre-validación contra
 * `GET /api/productividad/timer` para mostrar el modal explicativo.
 * Estos tests cubren la capa SERVIDOR que es la verdad final.
 */

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const enqueueWhatsAppMock = vi.fn().mockResolvedValue(undefined);
const enqueueEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notifications", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notifications")>(
    "@/lib/notifications",
  );
  return {
    ...actual,
    enqueueWhatsApp: (...a: any[]) => enqueueWhatsAppMock(...a),
    enqueueEmail: (...a: any[]) => enqueueEmailMock(...a),
  };
});

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { postUpdate } = await import("@/app/admin/casos/[id]/actions");

beforeEach(() => {
  authMock.mockReset();
  enqueueWhatsAppMock.mockReset();
  enqueueEmailMock.mockReset();
});

async function seedUser(role: string, sfx: string) {
  return _prisma.user.create({
    data: {
      fullName: `${role} ${sfx}`,
      email: `${role.toLowerCase()}-${sfx}@timer.test`,
      phone: `+5699${sfx.padStart(7, "0")}`,
      role,
      passwordHash: await bcrypt.hash("Pass1234", 4),
      active: true,
    },
  });
}

async function seedCase(input: {
  code: string;
  clientId: string;
  abogadoId?: string;
  stage?: string;
  halted?: boolean;
}) {
  const cat = await _prisma.category.upsert({
    where: { name: "CIVIL" },
    update: {},
    create: { name: "CIVIL" },
  });
  const kase = await _prisma.case.create({
    data: {
      code: input.code,
      client_id: input.clientId,
      categoryId: cat.id,
      stage: input.stage ?? "IN_PROGRESS",
      is_paid: !input.halted,
      abogados: input.abogadoId ? { connect: { id: input.abogadoId } } : undefined,
    },
  });
  if (input.halted) {
    await _prisma.case.update({
      where: { id: kase.id },
      data: { halted_at: new Date(), halted_reason: "Mora 30d", is_paid: false },
    });
  }
  return kase;
}

async function seedTimer(input: {
  lawyerId: string;
  caseId: string;
  status: "ACTIVE" | "PAUSED" | "PENDING_CLOSE";
}) {
  return _prisma.timerSession.create({
    data: {
      lawyerId: input.lawyerId,
      caseId: input.caseId,
      status: input.status,
      startedAt: new Date(),
      lastResumedAt: input.status === "ACTIVE" ? new Date() : null,
      accumulatedMs: 0,
    },
  });
}

describe("postUpdate · gate de conteo de horas (timer ACTIVE requerido para ABOGADO)", () => {
  it("CLIENTE rechazado por rol antes de mirar el timer (403)", async () => {
    authMock.mockResolvedValue({ user: { id: "x", role: "CLIENTE" } });
    const r = await postUpdate({ caseId: "x", description: "intento" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("forbidden");
      expect(r.reason).toMatch(/staff/i);
    }
  });

  it("body vacío → 400 invalid", async () => {
    authMock.mockResolvedValue({ user: { id: "x", role: "ABOGADO" } });
    const r = await postUpdate({ caseId: "x", description: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid");
  });

  it("ABOGADO sin timer activo → bloqueado con mensaje del gate", async () => {
    const cli = await seedUser("CLIENTE", "1");
    const abo = await seedUser("ABOGADO", "2");
    const kase = await seedCase({ code: "AT-GATE-1", clientId: cli.id, abogadoId: abo.id });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });

    const r = await postUpdate({ caseId: kase.id, description: "avance sin timer" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("invalid");
      expect(r.reason).toMatch(/iniciar el conteo/i);
    }

    const updates = await _prisma.update.findMany({ where: { caseId: kase.id } });
    expect(updates).toHaveLength(0);
    expect(enqueueWhatsAppMock).not.toHaveBeenCalled();
  });

  it("ABOGADO con timer PAUSED en este caso → bloqueado (sólo ACTIVE habilita)", async () => {
    const cli = await seedUser("CLIENTE", "3");
    const abo = await seedUser("ABOGADO", "4");
    const kase = await seedCase({ code: "AT-GATE-2", clientId: cli.id, abogadoId: abo.id });
    await seedTimer({ lawyerId: abo.id, caseId: kase.id, status: "PAUSED" });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });

    const r = await postUpdate({ caseId: kase.id, description: "timer pausado" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/iniciar el conteo/i);
  });

  it("ABOGADO con timer ACTIVE pero en OTRO caso → bloqueado", async () => {
    const cli = await seedUser("CLIENTE", "5");
    const abo = await seedUser("ABOGADO", "6");
    const kaseA = await seedCase({ code: "AT-GATE-A", clientId: cli.id, abogadoId: abo.id });
    const kaseB = await seedCase({ code: "AT-GATE-B", clientId: cli.id, abogadoId: abo.id });
    await seedTimer({ lawyerId: abo.id, caseId: kaseA.id, status: "ACTIVE" });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });

    // Intenta publicar en B mientras timer corre en A.
    const r = await postUpdate({ caseId: kaseB.id, description: "otro caso" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/iniciar el conteo/i);
  });

  it("ABOGADO con timer ACTIVE en este mismo caso → publica OK + encola WhatsApp+Email", async () => {
    const cli = await seedUser("CLIENTE", "7");
    const abo = await seedUser("ABOGADO", "8");
    const kase = await seedCase({ code: "AT-GATE-OK", clientId: cli.id, abogadoId: abo.id });
    await seedTimer({ lawyerId: abo.id, caseId: kase.id, status: "ACTIVE" });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });

    const r = await postUpdate({
      caseId: kase.id,
      description: "Demanda presentada con éxito.",
      documentUrl: "https://nexio.cl/docs/demanda.pdf",
    });
    expect(r.ok).toBe(true);

    const updates = await _prisma.update.findMany({ where: { caseId: kase.id } });
    expect(updates).toHaveLength(1);
    expect(updates[0].description).toBe("Demanda presentada con éxito.");
    expect(updates[0].document_url).toBe("https://nexio.cl/docs/demanda.pdf");
    expect(enqueueWhatsAppMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "case_update", caseId: kase.id }),
    );
    expect(enqueueEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "case_update", caseId: kase.id }),
    );
  });

  it("JEFE_DE_MESA sin timer → publica OK (gate solo aplica a ABOGADO)", async () => {
    const cli = await seedUser("CLIENTE", "9");
    const jefe = await seedUser("JEFE_DE_MESA", "10");
    const kase = await seedCase({ code: "AT-GATE-JEFE", clientId: cli.id });
    authMock.mockResolvedValue({ user: { id: jefe.id, role: "JEFE_DE_MESA" } });

    const r = await postUpdate({ caseId: kase.id, description: "supervisión del jefe" });
    expect(r.ok).toBe(true);
  });

  it("SUPER_ADMIN sin timer → publica OK", async () => {
    const cli = await seedUser("CLIENTE", "11");
    const admin = await seedUser("SUPER_ADMIN", "12");
    const kase = await seedCase({ code: "AT-GATE-SA", clientId: cli.id });
    authMock.mockResolvedValue({ user: { id: admin.id, role: "SUPER_ADMIN" } });

    const r = await postUpdate({ caseId: kase.id, description: "anotación de admin" });
    expect(r.ok).toBe(true);
  });

  it("caso HALTED_BY_PAYMENT bloquea con halted aunque haya timer ACTIVE", async () => {
    const cli = await seedUser("CLIENTE", "13");
    const abo = await seedUser("ABOGADO", "14");
    const kase = await seedCase({
      code: "AT-GATE-HALT",
      clientId: cli.id,
      abogadoId: abo.id,
      stage: "HALTED_BY_PAYMENT",
      halted: true,
    });
    await seedTimer({ lawyerId: abo.id, caseId: kase.id, status: "ACTIVE" });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });

    const r = await postUpdate({ caseId: kase.id, description: "con timer pero caso halt" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("halted");
  });

  it("ABOGADO con timer de OTRO abogado activo en este caso → bloqueado (timer debe ser propio)", async () => {
    const cli = await seedUser("CLIENTE", "15");
    const aboYo = await seedUser("ABOGADO", "16");
    const aboOtro = await seedUser("ABOGADO", "17");
    const kase = await seedCase({ code: "AT-GATE-OTRO", clientId: cli.id, abogadoId: aboYo.id });
    await _prisma.case.update({
      where: { id: kase.id },
      data: { abogados: { connect: { id: aboOtro.id } } },
    });
    // Timer del otro abogado.
    await seedTimer({ lawyerId: aboOtro.id, caseId: kase.id, status: "ACTIVE" });
    authMock.mockResolvedValue({ user: { id: aboYo.id, role: "ABOGADO" } });

    const r = await postUpdate({ caseId: kase.id, description: "yo no tengo timer" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/iniciar el conteo/i);
  });

  it("ABOGADO con timer PENDING_CLOSE (auto-pausado por inactividad) → bloqueado", async () => {
    const cli = await seedUser("CLIENTE", "18");
    const abo = await seedUser("ABOGADO", "19");
    const kase = await seedCase({ code: "AT-GATE-PC", clientId: cli.id, abogadoId: abo.id });
    await seedTimer({ lawyerId: abo.id, caseId: kase.id, status: "PENDING_CLOSE" });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });

    const r = await postUpdate({ caseId: kase.id, description: "tras 12h" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/iniciar el conteo/i);
  });
});
