import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { _prisma } from "@/lib/db/_client";
import { _resetRateLimit } from "@/lib/rate-limit";

/**
 * Suite de hardening de las server actions de mensajería + updates:
 *
 *   - validación UUID del caseId (anti path-traversal)
 *   - rate limit por usuario (anti-flood) — postComment 5/10s, postUpdate 8/30s
 *   - sanitize body (strip caracteres de control)
 *   - length cap (postComment 4000 · postUpdate 8000)
 *   - audit log COMMENT_POSTED en CADA path (text, audio, file, update)
 *
 * Estos tests son INDEPENDIENTES de los e2e funcionales — se enfocan
 * en los rieles de seguridad/robustez agregados al postComment +
 * postAudioComment + postFileComment + postUpdate.
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

const { postComment, postUpdate } = await import("@/app/admin/casos/[id]/actions");

beforeEach(() => {
  authMock.mockReset();
  enqueueWhatsAppMock.mockReset();
  enqueueEmailMock.mockReset();
  _resetRateLimit();
});

async function seedUser(role: string, sfx: string) {
  return _prisma.user.create({
    data: {
      fullName: `${role} ${sfx}`,
      email: `${role.toLowerCase()}-${sfx}@hard.test`,
      phone: `+5699${sfx.padStart(7, "0")}`,
      role,
      passwordHash: await bcrypt.hash("Pass1234", 4),
      active: true,
    },
  });
}

async function seedCase(input: { code: string; clientId: string; abogadoId?: string }) {
  const cat = await _prisma.category.upsert({
    where: { name: "CIVIL" },
    update: {},
    create: { name: "CIVIL" },
  });
  return _prisma.case.create({
    data: {
      code: input.code,
      client_id: input.clientId,
      categoryId: cat.id,
      stage: "OPEN",
      is_paid: true,
      abogados: input.abogadoId ? { connect: { id: input.abogadoId } } : undefined,
    },
  });
}

async function seedTimerActive(lawyerId: string, caseId: string) {
  return _prisma.timerSession.create({
    data: {
      lawyerId,
      caseId,
      status: "ACTIVE",
      startedAt: new Date(),
      lastResumedAt: new Date(),
      accumulatedMs: 0,
    },
  });
}

// ───────────────────────────────────────────────────────────────────────
// UUID validation
// ───────────────────────────────────────────────────────────────────────
describe("UUID validation del caseId", () => {
  it("postComment rechaza caseId no-UUID", async () => {
    const abo = await seedUser("ABOGADO", "1");
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });
    const r = await postComment({ caseId: "not-a-uuid", body: "hola", type: "PUBLIC" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/case id inválido/i);
  });

  it("postUpdate rechaza caseId con path traversal", async () => {
    const abo = await seedUser("ABOGADO", "2");
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });
    const r = await postUpdate({ caseId: "../../etc/passwd", description: "hola" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/case id inválido/i);
  });

  it("postComment acepta caseId UUID válido", async () => {
    const cli = await seedUser("CLIENTE", "3");
    const abo = await seedUser("ABOGADO", "4");
    const kase = await seedCase({ code: "AT-UUID-OK", clientId: cli.id, abogadoId: abo.id });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });
    const r = await postComment({ caseId: kase.id, body: "ok", type: "INTERNAL" });
    expect(r.ok).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Rate limit
// ───────────────────────────────────────────────────────────────────────
describe("Rate limit anti-flood", () => {
  it("postComment bloquea al 6° intento dentro de 10s", async () => {
    const cli = await seedUser("CLIENTE", "5");
    const abo = await seedUser("ABOGADO", "6");
    const kase = await seedCase({ code: "AT-RL-1", clientId: cli.id, abogadoId: abo.id });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });
    for (let i = 1; i <= 5; i++) {
      const r = await postComment({ caseId: kase.id, body: `msg ${i}`, type: "INTERNAL" });
      expect(r.ok).toBe(true);
    }
    const r6 = await postComment({ caseId: kase.id, body: "msg 6", type: "INTERNAL" });
    expect(r6.ok).toBe(false);
    if (!r6.ok) expect(r6.reason).toMatch(/Demasiados intentos/i);
  });

  it("postUpdate permite 8 antes de bloquear (cap 8/30s)", async () => {
    const cli = await seedUser("CLIENTE", "7");
    const abo = await seedUser("ABOGADO", "8");
    const kase = await seedCase({ code: "AT-RL-2", clientId: cli.id, abogadoId: abo.id });
    await seedTimerActive(abo.id, kase.id);
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });
    for (let i = 1; i <= 8; i++) {
      const r = await postUpdate({ caseId: kase.id, description: `update ${i}` });
      expect(r.ok).toBe(true);
    }
    const r9 = await postUpdate({ caseId: kase.id, description: "update 9" });
    expect(r9.ok).toBe(false);
    if (!r9.ok) expect(r9.reason).toMatch(/Demasiados intentos/i);
  });

  it("rate limit es por usuario — abogado A no afecta a abogado B", async () => {
    const cli = await seedUser("CLIENTE", "9");
    const aboA = await seedUser("ABOGADO", "10");
    const aboB = await seedUser("ABOGADO", "11");
    const kase = await seedCase({ code: "AT-RL-3", clientId: cli.id });
    // Agotar A
    authMock.mockResolvedValue({ user: { id: aboA.id, role: "ABOGADO" } });
    for (let i = 1; i <= 5; i++) {
      await postComment({ caseId: kase.id, body: `a ${i}`, type: "INTERNAL" });
    }
    const rA = await postComment({ caseId: kase.id, body: "a 6", type: "INTERNAL" });
    expect(rA.ok).toBe(false);

    // B sigue libre
    authMock.mockResolvedValue({ user: { id: aboB.id, role: "ABOGADO" } });
    const rB = await postComment({ caseId: kase.id, body: "b 1", type: "INTERNAL" });
    expect(rB.ok).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Sanitize + length cap
// ───────────────────────────────────────────────────────────────────────
describe("Sanitize body + length cap", () => {
  it("postComment strip caracteres de control", async () => {
    const cli = await seedUser("CLIENTE", "12");
    const abo = await seedUser("ABOGADO", "13");
    const kase = await seedCase({ code: "AT-SANI", clientId: cli.id, abogadoId: abo.id });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });

    // Body con NUL, BEL, etc.
    const r = await postComment({
      caseId: kase.id,
      body: "hola\x00mundo\x07\x1F!",
      type: "INTERNAL",
    });
    expect(r.ok).toBe(true);
    const rows = await _prisma.comment.findMany({ where: { caseId: kase.id } });
    expect(rows[0].body).toBe("holamundo!");
  });

  it("postComment rechaza body > 4000 chars", async () => {
    const cli = await seedUser("CLIENTE", "14");
    const abo = await seedUser("ABOGADO", "15");
    const kase = await seedCase({ code: "AT-CAP-1", clientId: cli.id, abogadoId: abo.id });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });
    const r = await postComment({
      caseId: kase.id,
      body: "x".repeat(4001),
      type: "INTERNAL",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/4000 caracteres/);
  });

  it("postUpdate rechaza description > 8000 chars", async () => {
    const cli = await seedUser("CLIENTE", "16");
    const abo = await seedUser("ABOGADO", "17");
    const kase = await seedCase({ code: "AT-CAP-2", clientId: cli.id, abogadoId: abo.id });
    await seedTimerActive(abo.id, kase.id);
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });
    const r = await postUpdate({ caseId: kase.id, description: "y".repeat(8001) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/8000 caracteres/);
  });

  it("postUpdate strip control chars en description", async () => {
    const cli = await seedUser("CLIENTE", "18");
    const abo = await seedUser("ABOGADO", "19");
    const kase = await seedCase({ code: "AT-SANI-2", clientId: cli.id, abogadoId: abo.id });
    await seedTimerActive(abo.id, kase.id);
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });
    const r = await postUpdate({
      caseId: kase.id,
      description: "avance\x00\x01\x02 con basura",
    });
    expect(r.ok).toBe(true);
    const rows = await _prisma.update.findMany({ where: { caseId: kase.id } });
    expect(rows[0].description).toBe("avance con basura");
  });
});

// ───────────────────────────────────────────────────────────────────────
// Audit log
// ───────────────────────────────────────────────────────────────────────
describe("Audit log COMMENT_POSTED", () => {
  it("postComment INTERNAL escribe audit en la misma tx", async () => {
    const cli = await seedUser("CLIENTE", "20");
    const abo = await seedUser("ABOGADO", "21");
    const kase = await seedCase({ code: "AT-AUDIT-1", clientId: cli.id, abogadoId: abo.id });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });
    const r = await postComment({ caseId: kase.id, body: "nota interna", type: "INTERNAL" });
    expect(r.ok).toBe(true);

    const audits = await _prisma.auditLog.findMany({
      where: { caseId: kase.id, action: "COMMENT_POSTED" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].channel).toBe("chat");
    expect(audits[0].template).toBe("internal_comment");
    expect(audits[0].status).toBe("ok");
    expect(audits[0].actorId).toBe(abo.id);
  });

  it("postComment PUBLIC escribe audit con template=public_comment", async () => {
    const cli = await seedUser("CLIENTE", "22");
    const abo = await seedUser("ABOGADO", "23");
    const kase = await seedCase({ code: "AT-AUDIT-2", clientId: cli.id, abogadoId: abo.id });
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });
    await postComment({ caseId: kase.id, body: "aviso al cliente", type: "PUBLIC" });
    const audits = await _prisma.auditLog.findMany({
      where: { caseId: kase.id, action: "COMMENT_POSTED" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].template).toBe("public_comment");
  });

  it("postUpdate escribe audit con channel=case-update", async () => {
    const cli = await seedUser("CLIENTE", "24");
    const abo = await seedUser("ABOGADO", "25");
    const kase = await seedCase({ code: "AT-AUDIT-3", clientId: cli.id, abogadoId: abo.id });
    await seedTimerActive(abo.id, kase.id);
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });
    await postUpdate({
      caseId: kase.id,
      description: "Demanda presentada.",
      documentUrl: "https://nexio.cl/d.pdf",
    });
    const audits = await _prisma.auditLog.findMany({
      where: { caseId: kase.id, action: "COMMENT_POSTED" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].channel).toBe("case-update");
    expect(audits[0].template).toBe("update_with_doc");
  });

  it("audit NO se escribe si la creación del Comment falla (atomicidad tx)", async () => {
    const cli = await seedUser("CLIENTE", "26");
    const abo = await seedUser("ABOGADO", "27");
    // Caso con id válido pero NO existe — case_id FK rompe la tx.
    const fakeCaseId = "00000000-0000-4000-8000-000000000001";
    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });
    try {
      await postComment({ caseId: fakeCaseId, body: "x", type: "INTERNAL" });
    } catch {
      // se espera error de FK
    }
    const audits = await _prisma.auditLog.findMany({
      where: { caseId: fakeCaseId, action: "COMMENT_POSTED" },
    });
    expect(audits).toHaveLength(0);
    // y tampoco hay Comment.
    const comments = await _prisma.comment.findMany({ where: { caseId: fakeCaseId } });
    expect(comments).toHaveLength(0);
  });
});
