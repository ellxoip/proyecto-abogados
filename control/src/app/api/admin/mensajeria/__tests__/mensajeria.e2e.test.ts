import { describe, expect, it, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { _prisma } from "@/lib/db/_client";
import {
  encodeAudioMessage,
  encodeFileMessage,
  parseAudioMessage,
  parseFileMessage,
  messageNotificationBody,
  AUDIO_MESSAGE_PREFIX,
  FILE_MESSAGE_PREFIX,
} from "@/lib/chat-message";

/**
 * Suite funcional del servicio de Mensajería (Comments) de service-control.
 *
 * Cubre 4 capas que tienen que estar verdes antes de subir a producción:
 *
 *   1. Lib pura `@/lib/chat-message` — codificación/decodificación de
 *      audios y archivos adjuntos transportados como body del Comment.
 *
 *   2. Server action `postComment` — auth, body vacío, separación
 *      INTERNAL/PUBLIC, cliente bloqueado de INTERNAL, fan-out de
 *      notificaciones WhatsApp+Email al publicar PUBLIC.
 *
 *   3. Endpoint `GET /api/admin/mensajeria/summary` — scoping por rol
 *      (ABOGADO solo sus casos, JEFE_DE_MESA su grupo, SUPER_ADMIN todo),
 *      bloqueo a CLIENTE, agrupación por (caseId, type) y conteo unread.
 *
 *   4. Endpoint `GET /api/admin/mensajeria/threads/[caseId]` — auth,
 *      filtros (type, q, limit), 404 cross-team, payload completo.
 */

// ── Mocks ──────────────────────────────────────────────────────────────
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
    enqueueWhatsApp: (...args: any[]) => enqueueWhatsAppMock(...args),
    enqueueEmail: (...args: any[]) => enqueueEmailMock(...args),
  };
});

// auth() — controlamos el usuario "logueado" por test.
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
}));

// Imports diferidos (dependen de mocks arriba).
const { postComment } = await import("@/app/admin/casos/[id]/actions");
const { GET: summaryGET } = await import(
  "@/app/api/admin/mensajeria/summary/route"
);
const { GET: threadsGET } = await import(
  "@/app/api/admin/mensajeria/threads/[caseId]/route"
);

beforeEach(() => {
  authMock.mockReset();
  enqueueWhatsAppMock.mockReset();
  enqueueEmailMock.mockReset();
});

// ── Helpers de seed ────────────────────────────────────────────────────
async function seedUser(role: string, suffix: string) {
  return _prisma.user.create({
    data: {
      fullName: `${role} ${suffix}`,
      email: `${role.toLowerCase()}-${suffix}@msg.test`,
      phone: `+5699${suffix.padStart(7, "0")}`,
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
  jefeId?: string;
  stage?: string;
}) {
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
      stage: input.stage ?? "OPEN",
      is_paid: true,
      jefe_mesa_id: input.jefeId ?? null,
      abogados: input.abogadoId
        ? { connect: { id: input.abogadoId } }
        : undefined,
    },
  });
}

function get(url: string) {
  return new Request(url);
}

// ───────────────────────────────────────────────────────────────────────
// 1. Lib chat-message — encode/parse audios y archivos
// ───────────────────────────────────────────────────────────────────────
describe("chat-message lib", () => {
  it("encodeAudioMessage agrega prefijo y JSON parseable", () => {
    const enc = encodeAudioMessage({
      kind: "audio",
      url: "https://cdn/x.mp3",
      name: "x.mp3",
      mime: "audio/mpeg",
      size: 1024,
    });
    expect(enc.startsWith(AUDIO_MESSAGE_PREFIX)).toBe(true);
    const parsed = parseAudioMessage(enc);
    expect(parsed).toEqual({
      kind: "audio",
      url: "https://cdn/x.mp3",
      name: "x.mp3",
      mime: "audio/mpeg",
      size: 1024,
    });
  });

  it("parseAudioMessage devuelve null si no es audio", () => {
    expect(parseAudioMessage("Hola, esto es texto normal.")).toBeNull();
    expect(parseAudioMessage(`${AUDIO_MESSAGE_PREFIX}{json invalido`)).toBeNull();
    expect(parseAudioMessage(`${AUDIO_MESSAGE_PREFIX}{"kind":"file"}`)).toBeNull();
  });

  it("encodeFileMessage / parseFileMessage round-trip", () => {
    const enc = encodeFileMessage({
      kind: "file",
      url: "https://cdn/contrato.pdf",
      name: "contrato.pdf",
      mime: "application/pdf",
      size: 2048,
    });
    expect(enc.startsWith(FILE_MESSAGE_PREFIX)).toBe(true);
    const parsed = parseFileMessage(enc);
    expect(parsed?.kind).toBe("file");
    expect(parsed?.url).toBe("https://cdn/contrato.pdf");
  });

  it("parseFileMessage rechaza payload mal armado", () => {
    expect(parseFileMessage("plain text")).toBeNull();
    expect(parseFileMessage(`${FILE_MESSAGE_PREFIX}{}`)).toBeNull();
    // sin url
    expect(
      parseFileMessage(`${FILE_MESSAGE_PREFIX}${JSON.stringify({ kind: "file" })}`),
    ).toBeNull();
  });

  it("messageNotificationBody reemplaza adjuntos por texto humano para push", () => {
    const audio = encodeAudioMessage({
      kind: "audio",
      url: "u",
      name: "n",
      mime: "audio/ogg",
      size: 1,
    });
    const file = encodeFileMessage({
      kind: "file",
      url: "u",
      name: "n",
      mime: "application/pdf",
      size: 1,
    });
    expect(messageNotificationBody(audio)).toMatch(/audio/i);
    expect(messageNotificationBody(file)).toMatch(/documento/i);
    expect(messageNotificationBody("hola equipo")).toBe("hola equipo");
  });
});

// ───────────────────────────────────────────────────────────────────────
// 2. Server action postComment
// ───────────────────────────────────────────────────────────────────────
describe("postComment server action", () => {
  it("401 sin sesión", async () => {
    authMock.mockResolvedValue(null);
    const r = await postComment({ caseId: "x", body: "hola", type: "PUBLIC" });
    expect(r).toEqual({ ok: false, code: "forbidden", reason: "unauthenticated" });
  });

  it("rechaza body vacío", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "ABOGADO" } });
    const r = await postComment({ caseId: "x", body: "   ", type: "PUBLIC" });
    expect(r).toEqual({ ok: false, code: "invalid", reason: "empty body" });
  });

  it("CLIENTE no puede crear comentarios INTERNAL", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "CLIENTE" } });
    const r = await postComment({
      caseId: "x",
      body: "info confidencial",
      type: "INTERNAL",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("forbidden");
  });

  it("crea comentario INTERNAL y NO encola notificaciones", async () => {
    const cliente = await seedUser("CLIENTE", "1");
    const abogado = await seedUser("ABOGADO", "2");
    const kase = await seedCase({
      code: "AT-MSG-INT",
      clientId: cliente.id,
      abogadoId: abogado.id,
    });
    authMock.mockResolvedValue({ user: { id: abogado.id, role: "ABOGADO" } });

    const r = await postComment({
      caseId: kase.id,
      body: "Nota interna del equipo",
      type: "INTERNAL",
    });
    expect(r.ok).toBe(true);
    expect(enqueueWhatsAppMock).not.toHaveBeenCalled();
    expect(enqueueEmailMock).not.toHaveBeenCalled();

    const rows = await _prisma.comment.findMany({ where: { caseId: kase.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("INTERNAL");
    expect(rows[0].body).toBe("Nota interna del equipo");
  });

  it("crea PUBLIC y encola WhatsApp+Email", async () => {
    const cliente = await seedUser("CLIENTE", "3");
    const abogado = await seedUser("ABOGADO", "4");
    const kase = await seedCase({
      code: "AT-MSG-PUB",
      clientId: cliente.id,
      abogadoId: abogado.id,
    });
    authMock.mockResolvedValue({ user: { id: abogado.id, role: "ABOGADO" } });

    const r = await postComment({
      caseId: kase.id,
      body: "Avisamos al cliente que la audiencia se agendó.",
      type: "PUBLIC",
    });
    expect(r.ok).toBe(true);
    expect(enqueueWhatsAppMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "public_comment", caseId: kase.id }),
    );
    expect(enqueueEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "public_comment", caseId: kase.id }),
    );
  });

  it("PUBLIC sobre caso HALTED_BY_PAYMENT queda bloqueado", async () => {
    const cliente = await seedUser("CLIENTE", "5");
    const abogado = await seedUser("ABOGADO", "6");
    const kase = await seedCase({
      code: "AT-MSG-HALT",
      clientId: cliente.id,
      abogadoId: abogado.id,
      stage: "HALTED_BY_PAYMENT",
    });
    await _prisma.case.update({
      where: { id: kase.id },
      data: { halted_at: new Date(), halted_reason: "Mora 30 días", is_paid: false },
    });
    authMock.mockResolvedValue({ user: { id: abogado.id, role: "ABOGADO" } });

    const r = await postComment({
      caseId: kase.id,
      body: "Aviso público",
      type: "PUBLIC",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("halted");
    // El comentario público NUNCA debe encolarse. (`checkCaseHealth` puede
    // encolar `non_payment_warning` como side-effect — ese sí es esperado).
    const publicCommentCalls = enqueueWhatsAppMock.mock.calls.filter(
      ([arg]: any[]) => arg?.kind === "public_comment",
    );
    expect(publicCommentCalls).toHaveLength(0);
    const emailPublicCalls = enqueueEmailMock.mock.calls.filter(
      ([arg]: any[]) => arg?.kind === "public_comment",
    );
    expect(emailPublicCalls).toHaveLength(0);
  });

  it("INTERNAL sobre caso HALTED sigue permitido (staff coordina aunque haya mora)", async () => {
    const cliente = await seedUser("CLIENTE", "7");
    const abogado = await seedUser("ABOGADO", "8");
    const kase = await seedCase({
      code: "AT-MSG-HALT-INT",
      clientId: cliente.id,
      abogadoId: abogado.id,
      stage: "HALTED_BY_PAYMENT",
    });
    await _prisma.case.update({
      where: { id: kase.id },
      data: { halted_at: new Date(), is_paid: false },
    });
    authMock.mockResolvedValue({ user: { id: abogado.id, role: "ABOGADO" } });

    const r = await postComment({
      caseId: kase.id,
      body: "Hay que llamar al cliente urgente",
      type: "INTERNAL",
    });
    expect(r.ok).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 3. GET /api/admin/mensajeria/summary — scoping por rol
// ───────────────────────────────────────────────────────────────────────
describe("GET /api/admin/mensajeria/summary", () => {
  it("401 sin sesión", async () => {
    authMock.mockResolvedValue(null);
    const res = await summaryGET();
    expect(res.status).toBe(401);
  });

  it("403 si el rol es CLIENTE", async () => {
    authMock.mockResolvedValue({ user: { id: "x", role: "CLIENTE" } });
    const res = await summaryGET();
    expect(res.status).toBe(403);
  });

  it("ABOGADO ve solo mensajes de casos donde está asignado", async () => {
    const cli1 = await seedUser("CLIENTE", "10");
    const cli2 = await seedUser("CLIENTE", "11");
    const aboMio = await seedUser("ABOGADO", "12");
    const aboOtro = await seedUser("ABOGADO", "13");

    const caseMio = await seedCase({
      code: "AT-MIO",
      clientId: cli1.id,
      abogadoId: aboMio.id,
    });
    const caseAjeno = await seedCase({
      code: "AT-AJENO",
      clientId: cli2.id,
      abogadoId: aboOtro.id,
    });

    await _prisma.comment.create({
      data: {
        caseId: caseMio.id,
        authorId: aboMio.id,
        body: "mensaje del caso mío",
        type: "INTERNAL",
      },
    });
    await _prisma.comment.create({
      data: {
        caseId: caseAjeno.id,
        authorId: aboOtro.id,
        body: "mensaje del caso ajeno",
        type: "INTERNAL",
      },
    });

    authMock.mockResolvedValue({ user: { id: aboMio.id, role: "ABOGADO" } });
    const res = await summaryGET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    const codes = body.messages.map((m: { caseCode: string }) => m.caseCode);
    expect(codes).toContain("AT-MIO");
    expect(codes).not.toContain("AT-AJENO");
  });

  it("agrupa por (caseId, type) — toma el más reciente de cada combo", async () => {
    const cli = await seedUser("CLIENTE", "14");
    const abo = await seedUser("ABOGADO", "15");
    const kase = await seedCase({
      code: "AT-GROUP",
      clientId: cli.id,
      abogadoId: abo.id,
    });
    await _prisma.comment.create({
      data: { caseId: kase.id, authorId: abo.id, body: "viejo público", type: "PUBLIC" },
    });
    await new Promise((r) => setTimeout(r, 5));
    await _prisma.comment.create({
      data: { caseId: kase.id, authorId: abo.id, body: "nuevo público", type: "PUBLIC" },
    });
    await _prisma.comment.create({
      data: { caseId: kase.id, authorId: abo.id, body: "interna A", type: "INTERNAL" },
    });

    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });
    const res = await summaryGET();
    const body = await res.json();
    expect(res.status).toBe(200);
    // 2 entries para este caso (PUBLIC + INTERNAL), el PUBLIC debe ser el reciente.
    const ofCase = body.messages.filter(
      (m: { caseCode: string }) => m.caseCode === "AT-GROUP",
    );
    expect(ofCase).toHaveLength(2);
    const pub = ofCase.find((m: { type: string }) => m.type === "PUBLIC");
    expect(pub.body).toBe("nuevo público");
  });

  it("unreadCount excluye mensajes propios del usuario logueado", async () => {
    const cli = await seedUser("CLIENTE", "16");
    const aboA = await seedUser("ABOGADO", "17");
    const aboB = await seedUser("ABOGADO", "18");
    // Caso compartido — ambos abogados asignados.
    const kase = await seedCase({
      code: "AT-UNREAD",
      clientId: cli.id,
      abogadoId: aboA.id,
    });
    await _prisma.case.update({
      where: { id: kase.id },
      data: { abogados: { connect: { id: aboB.id } } },
    });
    await _prisma.comment.create({
      data: { caseId: kase.id, authorId: aboA.id, body: "míos", type: "INTERNAL" },
    });
    await _prisma.comment.create({
      data: { caseId: kase.id, authorId: aboB.id, body: "del otro", type: "INTERNAL" },
    });

    authMock.mockResolvedValue({ user: { id: aboA.id, role: "ABOGADO" } });
    const res = await summaryGET();
    const body = await res.json();
    // Grouped por (caseId, type) → 1 entrada por (kase.id, INTERNAL). El más
    // reciente es del otro abogado → unreadCount=1.
    expect(body.unreadCount).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 4. GET /api/admin/mensajeria/threads/[caseId]
// ───────────────────────────────────────────────────────────────────────
describe("GET /api/admin/mensajeria/threads/[caseId]", () => {
  it("401 sin sesión", async () => {
    authMock.mockResolvedValue(null);
    const res = await threadsGET(get("http://t/x"), { params: { caseId: "x" } });
    expect(res.status).toBe(401);
  });

  it("403 si rol CLIENTE", async () => {
    authMock.mockResolvedValue({ user: { id: "x", role: "CLIENTE" } });
    const res = await threadsGET(get("http://t/x"), { params: { caseId: "x" } });
    expect(res.status).toBe(403);
  });

  it("404 si el caso está fuera del scope del abogado", async () => {
    const cli = await seedUser("CLIENTE", "20");
    const aboMio = await seedUser("ABOGADO", "21");
    const aboOtro = await seedUser("ABOGADO", "22");
    const caseAjeno = await seedCase({
      code: "AT-FUERA",
      clientId: cli.id,
      abogadoId: aboOtro.id,
    });
    authMock.mockResolvedValue({ user: { id: aboMio.id, role: "ABOGADO" } });
    const res = await threadsGET(get(`http://t/${caseAjeno.id}`), {
      params: { caseId: caseAjeno.id },
    });
    expect(res.status).toBe(404);
  });

  it("SUPER_ADMIN ve cualquier caso + retorna mensajes en orden ascendente", async () => {
    const cli = await seedUser("CLIENTE", "23");
    const abo = await seedUser("ABOGADO", "24");
    const admin = await seedUser("SUPER_ADMIN", "25");
    const kase = await seedCase({
      code: "AT-FULL",
      clientId: cli.id,
      abogadoId: abo.id,
    });
    await _prisma.comment.create({
      data: { caseId: kase.id, authorId: abo.id, body: "primer mensaje", type: "INTERNAL" },
    });
    await new Promise((r) => setTimeout(r, 5));
    await _prisma.comment.create({
      data: { caseId: kase.id, authorId: abo.id, body: "segundo", type: "PUBLIC" },
    });

    authMock.mockResolvedValue({ user: { id: admin.id, role: "SUPER_ADMIN" } });
    const res = await threadsGET(get(`http://t/${kase.id}`), {
      params: { caseId: kase.id },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.case.code).toBe("AT-FULL");
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].body).toBe("primer mensaje");
    expect(body.messages[1].body).toBe("segundo");
    expect(body.messages[1].isMine).toBe(false);
  });

  it("filtro ?type=INTERNAL devuelve solo INTERNAL", async () => {
    const cli = await seedUser("CLIENTE", "26");
    const abo = await seedUser("ABOGADO", "27");
    const kase = await seedCase({
      code: "AT-FILTER",
      clientId: cli.id,
      abogadoId: abo.id,
    });
    await _prisma.comment.create({
      data: { caseId: kase.id, authorId: abo.id, body: "interna", type: "INTERNAL" },
    });
    await _prisma.comment.create({
      data: { caseId: kase.id, authorId: abo.id, body: "publica", type: "PUBLIC" },
    });

    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });
    const res = await threadsGET(
      get(`http://t/${kase.id}?type=INTERNAL`),
      { params: { caseId: kase.id } },
    );
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].type).toBe("INTERNAL");
  });

  it("retorna equipo interno del caso con jefe de mesa y abogados compartidos", async () => {
    const cli = await seedUser("CLIENTE", "26a");
    const jefe = await seedUser("JEFE_DE_MESA", "26b");
    const aboA = await seedUser("ABOGADO", "26c");
    const aboB = await seedUser("ABOGADO", "26d");
    await _prisma.user.updateMany({
      where: { id: { in: [aboA.id, aboB.id] } },
      data: { managedById: jefe.id },
    });
    const kase = await seedCase({
      code: "AT-TEAM",
      clientId: cli.id,
      jefeId: jefe.id,
      abogadoId: aboA.id,
    });
    await _prisma.case.update({
      where: { id: kase.id },
      data: { abogados: { connect: { id: aboB.id } } },
    });

    authMock.mockResolvedValue({ user: { id: aboA.id, role: "ABOGADO" } });
    const res = await threadsGET(
      get(`http://t/${kase.id}?type=INTERNAL`),
      { params: { caseId: kase.id } },
    );
    const body = await res.json();
    const memberIds = body.case.staffTeam.map((m: { id: string }) => m.id).sort();
    expect(memberIds).toEqual([aboA.id, aboB.id, jefe.id].sort());
    expect(body.case.staffTeam.find((m: { id: string }) => m.id === jefe.id).role).toBe("JEFE_DE_MESA");
  });

  it("filtro ?q=audiencia hace search por substring en el body", async () => {
    const cli = await seedUser("CLIENTE", "28");
    const abo = await seedUser("ABOGADO", "29");
    const kase = await seedCase({
      code: "AT-SEARCH",
      clientId: cli.id,
      abogadoId: abo.id,
    });
    await _prisma.comment.create({
      data: { caseId: kase.id, authorId: abo.id, body: "audiencia agendada", type: "PUBLIC" },
    });
    await _prisma.comment.create({
      data: { caseId: kase.id, authorId: abo.id, body: "otro asunto", type: "INTERNAL" },
    });

    authMock.mockResolvedValue({ user: { id: abo.id, role: "ABOGADO" } });
    const res = await threadsGET(
      get(`http://t/${kase.id}?q=audiencia`),
      { params: { caseId: kase.id } },
    );
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].body).toContain("audiencia");
  });
});

// ───────────────────────────────────────────────────────────────────────
// 5. Integración cross-capa: audio Comment → notificación humana
// ───────────────────────────────────────────────────────────────────────
describe("audio/file comments → notification body humano", () => {
  it("messageNotificationBody convierte un audio Comment.body en texto push", async () => {
    const cli = await seedUser("CLIENTE", "30");
    const abo = await seedUser("ABOGADO", "31");
    const kase = await seedCase({
      code: "AT-AUDIO",
      clientId: cli.id,
      abogadoId: abo.id,
    });
    const encoded = encodeAudioMessage({
      kind: "audio",
      url: "https://supabase/storage/audio.mp3",
      name: "audio.mp3",
      mime: "audio/mpeg",
      size: 12345,
    });
    const c = await _prisma.comment.create({
      data: { caseId: kase.id, authorId: abo.id, body: encoded, type: "PUBLIC" },
    });
    // Lo que `dispatch.ts` enviaría a WhatsApp/Email como body humano:
    const human = messageNotificationBody(c.body);
    expect(human).toMatch(/audio/i);
    expect(human).not.toContain(AUDIO_MESSAGE_PREFIX);
  });
});
