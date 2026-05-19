import { describe, expect, it, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { _prisma } from "@/lib/db/_client";

// Mocks de next/cache: en runtime de tests no hay React cache server context.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Mock de enqueue para no tocar BullMQ/Redis ni Resend/Meta.
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

// auth() devuelve la sesión controlada por test.
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
}));

const { advanceToInProgress } = await import("@/app/admin/casos/[id]/stage-actions");
const { finishCase } = await import("@/app/admin/casos/[id]/finish-actions");

async function seedClient() {
  const passwordHash = await bcrypt.hash("Y732HX", 12);
  return _prisma.user.create({
    data: {
      fullName: "Cliente Test",
      email: "cliente@test.cl",
      phone: "+56900000001",
      role: "CLIENTE",
      passwordHash,
      rut: "11111111-1",
      active: true,
      mustChangePassword: false,
    },
  });
}

async function seedAbogado(name = "Abogado Test") {
  const passwordHash = await bcrypt.hash("AbogadoPass1", 12);
  return _prisma.user.create({
    data: {
      fullName: name,
      email: `${name.replace(/\s/g, "-").toLowerCase()}@test.cl`,
      phone: "+56900000002",
      role: "ABOGADO",
      passwordHash,
      mustChangePassword: false,
    },
  });
}

async function seedCase(opts: { clientId: string; stage?: string; abogadoIds?: string[]; code?: string }) {
  return _prisma.case.create({
    data: {
      code: opts.code ?? `AT-TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      client_id: opts.clientId,
      stage: opts.stage ?? "OPEN",
      is_paid: true,
      abogados: opts.abogadoIds ? { connect: opts.abogadoIds.map((id) => ({ id })) } : undefined,
    },
  });
}

beforeEach(() => {
  authMock.mockReset();
  enqueueWhatsAppMock.mockReset();
  enqueueEmailMock.mockReset();
});

describe("advanceToInProgress", () => {
  it("rechaza sin sesión", async () => {
    authMock.mockResolvedValue(null);
    const r = await advanceToInProgress("any");
    expect(r).toEqual({ success: false, error: "No autorizado" });
  });

  it("rechaza si el rol es CLIENTE", async () => {
    const client = await seedClient();
    authMock.mockResolvedValue({ user: { id: client.id, role: "CLIENTE", name: "x" } });
    const r = await advanceToInProgress("any");
    expect(r).toEqual({ success: false, error: "Sin permisos" });
  });

  it("404 cuando el caso no existe", async () => {
    const abo = await seedAbogado();
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO", name: "x" } });
    const r = await advanceToInProgress("00000000-0000-0000-0000-000000000000");
    expect(r.success).toBe(false);
  });

  it("idempotente: si ya está IN_PROGRESS devuelve alreadyAdvanced", async () => {
    const cliente = await seedClient();
    const abo = await seedAbogado();
    const kase = await seedCase({ clientId: cliente.id, stage: "IN_PROGRESS", abogadoIds: [abo.id] });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO", name: "x" } });

    const r = await advanceToInProgress(kase.id);
    expect(r).toEqual({ success: true, alreadyAdvanced: true });
  });

  it("rechaza si la transición no es válida (ej. desde FINISHED)", async () => {
    const cliente = await seedClient();
    const abo = await seedAbogado();
    const kase = await seedCase({ clientId: cliente.id, stage: "FINISHED" });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO", name: "x" } });

    const r = await advanceToInProgress(kase.id);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("No se puede avanzar");
  });

  it("auto-asigna al abogado actual si el caso no tiene abogados", async () => {
    const cliente = await seedClient();
    const abo = await seedAbogado();
    const kase = await seedCase({ clientId: cliente.id, stage: "OPEN" });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO", name: "Juan" } });

    const r = await advanceToInProgress(kase.id);
    expect(r.success).toBe(true);

    const after = await _prisma.case.findUnique({
      where: { id: kase.id },
      include: { abogados: { select: { id: true } } },
    });
    expect(after!.stage).toBe("IN_PROGRESS");
    expect(after!.abogados.map((a) => a.id)).toContain(abo.id);

    const audit = await _prisma.auditLog.findFirst({
      where: { action: "CASE_ASSIGNED", caseId: kase.id },
    });
    expect(audit).not.toBeNull();
  });

  it("SUPER_ADMIN puede avanzar sin autoasignarse", async () => {
    const cliente = await seedClient();
    const otroAbo = await seedAbogado("Otro Abogado");
    const passwordHash = await bcrypt.hash("AdminPass1", 12);
    const admin = await _prisma.user.create({
      data: {
        fullName: "Admin",
        email: "admin@test.cl",
        phone: "+56900000099",
        role: "SUPER_ADMIN",
        passwordHash,
        mustChangePassword: false,
      },
    });
    const kase = await seedCase({ clientId: cliente.id, stage: "OPEN", abogadoIds: [otroAbo.id] });
    authMock.mockResolvedValue({ user: { id: admin.id, role: "SUPER_ADMIN", name: "Admin" } });

    const r = await advanceToInProgress(kase.id);
    expect(r.success).toBe(true);

    const after = await _prisma.case.findUnique({
      where: { id: kase.id },
      include: { abogados: { select: { id: true } } },
    });
    expect(after!.abogados.map((a) => a.id)).toEqual([otroAbo.id]);
  });
});

describe("finishCase", () => {
  it("lanza si no hay sesión", async () => {
    authMock.mockResolvedValue(null);
    await expect(finishCase("any")).rejects.toThrow("unauthenticated");
  });

  it("rechaza si el rol es CLIENTE", async () => {
    const cliente = await seedClient();
    authMock.mockResolvedValue({ user: { id: cliente.id, role: "CLIENTE", name: "x" } });
    const r = await finishCase("any");
    expect(r.success).toBe(false);
  });

  it("404 cuando el caso no existe", async () => {
    const abo = await seedAbogado();
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO", name: "x" } });
    const r = await finishCase("00000000-0000-0000-0000-000000000000");
    expect(r.success).toBe(false);
  });

  it("rechaza si el caso aún no está IN_PROGRESS", async () => {
    const cliente = await seedClient();
    const abo = await seedAbogado();
    const kase = await seedCase({ clientId: cliente.id, stage: "OPEN", abogadoIds: [abo.id] });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO", name: "x" } });

    const r = await finishCase(kase.id);
    expect(r.success).toBe(false);
  });

  it("ABOGADO no puede finalizar caso que no le está asignado", async () => {
    const cliente = await seedClient();
    const abo = await seedAbogado();
    const otro = await seedAbogado("Otro");
    const kase = await seedCase({ clientId: cliente.id, stage: "IN_PROGRESS", abogadoIds: [otro.id] });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO", name: "x" } });

    const r = await finishCase(kase.id);
    expect(r.success).toBe(false);
  });

  it("idempotente: si ya está FINISHED devuelve alreadyFinished", async () => {
    const cliente = await seedClient();
    const abo = await seedAbogado();
    const kase = await seedCase({ clientId: cliente.id, stage: "FINISHED", abogadoIds: [abo.id] });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO", name: "x" } });

    const r = await finishCase(kase.id);
    expect(r).toEqual({ success: true, alreadyFinished: true });
  });

  it("rechaza si no hay resolución adjunta", async () => {
    const cliente = await seedClient();
    const abo = await seedAbogado();
    const kase = await seedCase({ clientId: cliente.id, stage: "IN_PROGRESS", abogadoIds: [abo.id] });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO", name: "x" } });

    const r = await finishCase(kase.id);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("resolución");

    const after = await _prisma.case.findUnique({ where: { id: kase.id } });
    expect(after!.stage).toBe("IN_PROGRESS");
    expect(after!.resolvedAt).toBeNull();
    expect(enqueueWhatsAppMock).not.toHaveBeenCalled();
    expect(enqueueEmailMock).not.toHaveBeenCalled();
  });

  it("rechaza si solo hay documentos no marcados como resolución final", async () => {
    const cliente = await seedClient();
    const abo = await seedAbogado();
    const kase = await seedCase({ clientId: cliente.id, stage: "IN_PROGRESS", abogadoIds: [abo.id] });
    await _prisma.update.create({
      data: {
        caseId: kase.id,
        description: "Orden de Trabajo adjunta",
        document_url: "https://docs.test/ot.pdf",
      },
    });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO", name: "x" } });

    const r = await finishCase(kase.id);
    expect(r.success).toBe(false);

    const after = await _prisma.case.findUnique({ where: { id: kase.id } });
    expect(after!.stage).toBe("IN_PROGRESS");
    expect(enqueueWhatsAppMock).not.toHaveBeenCalled();
    expect(enqueueEmailMock).not.toHaveBeenCalled();
  });

  it("happy path: marca FINISHED, crea Update con resolución adjunta, encola WhatsApp+Email", async () => {
    const cliente = await seedClient();
    const abo = await seedAbogado();
    const kase = await seedCase({ clientId: cliente.id, stage: "IN_PROGRESS", abogadoIds: [abo.id] });
    await _prisma.update.create({
      data: {
        caseId: kase.id,
        description: "Resolución final adjunta",
        document_url: "https://docs.test/resolucion-final.pdf",
      },
    });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO", name: "x" } });

    const r = await finishCase(kase.id);
    expect(r.success).toBe(true);
    expect("resolutionDocumentUrl" in r).toBe(true);
    if (!("resolutionDocumentUrl" in r)) throw new Error("missing resolutionDocumentUrl");
    expect(r.resolutionDocumentUrl).toBe("https://docs.test/resolucion-final.pdf");

    const after = await _prisma.case.findUnique({ where: { id: kase.id } });
    expect(after!.stage).toBe("FINISHED");
    expect(after!.resolvedAt).not.toBeNull();

    const updates = await _prisma.update.findMany({ where: { caseId: kase.id } });
    expect(updates).toHaveLength(2);
    const finishUpdate = updates.find((u) => u.description.includes("concluido exitosamente"));
    expect(finishUpdate).toBeTruthy();
    expect(finishUpdate!.description).toContain(kase.code);
    expect(finishUpdate!.document_url).toBe("https://docs.test/resolucion-final.pdf");

    expect(enqueueWhatsAppMock).toHaveBeenCalledWith({ kind: "case_finished", caseId: kase.id });
    expect(enqueueEmailMock).toHaveBeenCalledWith({ kind: "case_finished", caseId: kase.id });
  });
});
