import { describe, expect, it, beforeEach, beforeAll, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { GET as caseUpdatesGET } from "@/app/api/v1/case-updates/[identifier]/route";
import { _prisma } from "@/lib/db/_client";

/**
 * Test del contrato que consume PagaCuotas para mostrar el detalle del
 * caso legal del cliente.
 *
 * Cuando el cliente se autentica en PagaCuotas, el portal llama a:
 *   GET /api/v1/case-updates/:rut
 *
 * y debe recibir TODOS los hitos del expediente:
 *   - Estado actual del caso (stage), categoría, código.
 *   - Equipo asignado (abogados).
 *   - Timeline completo de Updates ordenado del más nuevo al más viejo,
 *     incluyendo descripción del hito y document_url cuando aplica.
 *
 * Los Updates representan los avances mayores del caso (OT inicial,
 * demanda presentada, audiencia, sentencia, etc.). Este test verifica
 * que el payload entregado a PagaCuotas refleje fielmente el estado
 * actual del caso en service-control.
 */

const KEY = "external-test-key";

beforeAll(() => {
  vi.stubEnv("EXTERNAL_API_KEY", KEY);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function authedGet(url: string, key = KEY) {
  return new NextRequest(url, {
    headers: { authorization: `Bearer ${key}` },
  });
}

async function seedClienteConHitos() {
  const passwordHash = await bcrypt.hash("Y732HX", 12);
  const cliente = await _prisma.user.create({
    data: {
      fullName: "Matias Villalobos",
      email: "mv@test.cl",
      phone: "+56986173914",
      role: "CLIENTE",
      passwordHash,
      rut: "21331955-8",
      mustChangePassword: false,
      active: true,
    },
  });

  const abogado1 = await _prisma.user.create({
    data: {
      fullName: "Pedro Abogado",
      email: "pedro@firma.cl",
      phone: "+56911111111",
      role: "ABOGADO",
      passwordHash: "hash",
      active: true,
    },
  });
  const abogado2 = await _prisma.user.create({
    data: {
      fullName: "Carla Abogada",
      email: "carla@firma.cl",
      phone: "+56922222222",
      role: "ABOGADO",
      passwordHash: "hash",
      active: true,
    },
  });

  const cat = await _prisma.category.create({ data: { name: "CIVIL" } });
  const kase = await _prisma.case.create({
    data: {
      code: "AT-PC-001",
      client_id: cliente.id,
      categoryId: cat.id,
      stage: "IN_PROGRESS",
      is_paid: true,
      saldo_financiado: 1500000,
      abogados: { connect: [{ id: abogado1.id }, { id: abogado2.id }] },
    },
  });

  // Hitos (Updates) — insertados en orden cronológico ascendente.
  // El endpoint debe devolverlos en orden descendente (último primero).
  const hito1 = await _prisma.update.create({
    data: {
      caseId: kase.id,
      description: "[OT/CIVIL] DEMANDA_INICIAL\nGenerada en NEXIO el 2025-05-01.",
      document_url: "https://nexio.cl/docs/ot-001.pdf",
      createdAt: new Date("2025-05-01T10:00:00Z"),
    },
  });
  const hito2 = await _prisma.update.create({
    data: {
      caseId: kase.id,
      description: "Demanda presentada en juzgado civil de Santiago.",
      document_url: "https://nexio.cl/docs/demanda-001.pdf",
      createdAt: new Date("2025-05-15T14:00:00Z"),
    },
  });
  const hito3 = await _prisma.update.create({
    data: {
      caseId: kase.id,
      description: "Audiencia preparatoria agendada para el 2025-07-10.",
      document_url: null,
      createdAt: new Date("2025-06-01T09:00:00Z"),
    },
  });
  const hito4 = await _prisma.update.create({
    data: {
      caseId: kase.id,
      description: "Contestación de la contraparte recibida y revisada.",
      document_url: "https://nexio.cl/docs/contestacion-001.pdf",
      createdAt: new Date("2025-06-20T16:00:00Z"),
    },
  });

  return { cliente, abogado1, abogado2, kase, cat, hitos: [hito1, hito2, hito3, hito4] };
}

describe("GET /api/v1/case-updates/:identifier — vista PagaCuotas", () => {
  it("rechaza 401 sin Bearer", async () => {
    const res = await caseUpdatesGET(
      new NextRequest("http://test/api/v1/case-updates/21331955-8"),
      { params: { identifier: "21331955-8" } },
    );
    expect(res.status).toBe(401);
  });

  it("rechaza 401 con Bearer incorrecto", async () => {
    const res = await caseUpdatesGET(
      authedGet("http://test/api/v1/case-updates/21331955-8", "bearer-malo"),
      { params: { identifier: "21331955-8" } },
    );
    expect(res.status).toBe(401);
  });

  it("retorna 404 si el RUT no existe en service-control", async () => {
    const res = await caseUpdatesGET(
      authedGet("http://test/api/v1/case-updates/99999999-9"),
      { params: { identifier: "99999999-9" } },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("retorna 400 si el identifier viene vacío", async () => {
    const res = await caseUpdatesGET(
      authedGet("http://test/api/v1/case-updates/%20"),
      { params: { identifier: " " } },
    );
    expect(res.status).toBe(400);
  });

  it("entrega el caso completo del cliente con datos para PagaCuotas", async () => {
    const { cliente, kase, abogado1, abogado2 } = await seedClienteConHitos();

    const res = await caseUpdatesGET(
      authedGet(`http://test/api/v1/case-updates/${encodeURIComponent(cliente.rut!)}`),
      { params: { identifier: cliente.rut! } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    // 1. Cabecera correcta.
    expect(body.success).toBe(true);
    expect(body.identifier).toBe(cliente.rut);
    expect(body.cliente).toEqual({
      id: cliente.id,
      nombre: "Matias Villalobos",
      email: "mv@test.cl",
    });

    // 2. Un caso devuelto, con metadata jurídica visible.
    expect(body.cases).toHaveLength(1);
    const caso = body.cases[0];
    expect(caso.id).toBe(kase.id);
    expect(caso.code).toBe("AT-PC-001");
    expect(caso.stage).toBe("IN_PROGRESS");
    expect(caso.categoria).toBe("CIVIL");

    // 3. Equipo legal asignado expuesto al cliente.
    expect(caso.abogados).toHaveLength(2);
    const abogadosIds = caso.abogados.map((a: { id: string }) => a.id).sort();
    expect(abogadosIds).toEqual([abogado1.id, abogado2.id].sort());
    const abogadosNombres = caso.abogados.map((a: { nombre: string }) => a.nombre).sort();
    expect(abogadosNombres).toEqual(["Carla Abogada", "Pedro Abogado"]);
  });

  it("devuelve los hitos en orden cronológico inverso (último primero)", async () => {
    const { cliente, hitos } = await seedClienteConHitos();

    const res = await caseUpdatesGET(
      authedGet(`http://test/api/v1/case-updates/${encodeURIComponent(cliente.rut!)}`),
      { params: { identifier: cliente.rut! } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    const caso = body.cases[0];
    expect(caso.total_updates).toBe(4);
    expect(caso.updates).toHaveLength(4);

    // Orden descendente por createdAt — primero el más nuevo (hito4).
    const orderedIds = caso.updates.map((u: { id: string }) => u.id);
    expect(orderedIds).toEqual([hitos[3].id, hitos[2].id, hitos[1].id, hitos[0].id]);

    // El primer hito devuelto trae la descripción del avance más reciente.
    expect(caso.updates[0].description).toContain(
      "Contestación de la contraparte recibida",
    );
    expect(caso.updates[0].document_url).toBe(
      "https://nexio.cl/docs/contestacion-001.pdf",
    );
    expect(caso.updates[0].created_at).toBe("2025-06-20T16:00:00.000Z");

    // Hito sin documento adjunto: document_url debe ser null.
    const audiencia = caso.updates.find((u: { description: string }) =>
      u.description.includes("Audiencia preparatoria"),
    );
    expect(audiencia).toBeDefined();
    expect(audiencia.document_url).toBeNull();

    // Hito OT inicial expuesto con su PDF.
    const ot = caso.updates.find((u: { description: string }) =>
      u.description.includes("DEMANDA_INICIAL"),
    );
    expect(ot).toBeDefined();
    expect(ot.document_url).toBe("https://nexio.cl/docs/ot-001.pdf");
  });

  it("refleja un nuevo hito agregado entre dos llamadas (vista live)", async () => {
    const { cliente, kase } = await seedClienteConHitos();
    const rut = cliente.rut!;

    const res1 = await caseUpdatesGET(
      authedGet(`http://test/api/v1/case-updates/${encodeURIComponent(rut)}`),
      { params: { identifier: rut } },
    );
    const body1 = await res1.json();
    expect(body1.cases[0].total_updates).toBe(4);

    // Service-control registra un nuevo avance: "Sentencia favorable".
    await _prisma.update.create({
      data: {
        caseId: kase.id,
        description: "Sentencia favorable de primera instancia. Tribunal acogió la demanda.",
        document_url: "https://nexio.cl/docs/sentencia-001.pdf",
        createdAt: new Date("2025-08-01T11:30:00Z"),
      },
    });

    const res2 = await caseUpdatesGET(
      authedGet(`http://test/api/v1/case-updates/${encodeURIComponent(rut)}`),
      { params: { identifier: rut } },
    );
    const body2 = await res2.json();

    const caso = body2.cases[0];
    expect(caso.total_updates).toBe(5);
    expect(caso.updates).toHaveLength(5);
    expect(caso.updates[0].description).toContain("Sentencia favorable");
    expect(caso.updates[0].document_url).toBe(
      "https://nexio.cl/docs/sentencia-001.pdf",
    );
  });

  it("retorna múltiples casos del mismo cliente, ordenados por updatedAt desc", async () => {
    const cliente = await _prisma.user.create({
      data: {
        fullName: "Cliente Multi",
        email: "multi@test.cl",
        phone: "+56933333333",
        role: "CLIENTE",
        passwordHash: "hash",
        rut: "30000000-0",
        active: true,
        mustChangePassword: false,
      },
    });
    const cat = await _prisma.category.create({ data: { name: "LABORAL" } });

    const caseViejo = await _prisma.case.create({
      data: {
        code: "AT-MULTI-OLD",
        client_id: cliente.id,
        categoryId: cat.id,
        stage: "FINISHED",
        is_paid: true,
      },
    });
    const caseNuevo = await _prisma.case.create({
      data: {
        code: "AT-MULTI-NEW",
        client_id: cliente.id,
        categoryId: cat.id,
        stage: "IN_PROGRESS",
        is_paid: true,
      },
    });

    // Forzar updatedAt para que caseNuevo sea posterior.
    await _prisma.case.update({
      where: { id: caseViejo.id },
      data: { updatedAt: new Date("2025-01-01T00:00:00Z") },
    });
    await _prisma.case.update({
      where: { id: caseNuevo.id },
      data: { updatedAt: new Date("2025-08-01T00:00:00Z") },
    });

    const res = await caseUpdatesGET(
      authedGet(`http://test/api/v1/case-updates/${encodeURIComponent(cliente.rut!)}`),
      { params: { identifier: cliente.rut! } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.cases).toHaveLength(2);
    expect(body.cases[0].code).toBe("AT-MULTI-NEW");
    expect(body.cases[0].stage).toBe("IN_PROGRESS");
    expect(body.cases[1].code).toBe("AT-MULTI-OLD");
    expect(body.cases[1].stage).toBe("FINISHED");
  });

  it("retorna lista de casos vacía si el cliente existe pero no tiene casos", async () => {
    await _prisma.user.create({
      data: {
        fullName: "Sin Casos",
        email: "sincasos@test.cl",
        phone: "+56944444444",
        role: "CLIENTE",
        passwordHash: "hash",
        rut: "40000000-0",
        active: true,
        mustChangePassword: false,
      },
    });

    const res = await caseUpdatesGET(
      authedGet("http://test/api/v1/case-updates/40000000-0"),
      { params: { identifier: "40000000-0" } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.cases).toEqual([]);
  });

  it("decodea correctamente el RUT URL-encoded en el path", async () => {
    const { cliente } = await seedClienteConHitos();
    // RUT con "-" debe sobrevivir al encode/decode.
    const encoded = encodeURIComponent(cliente.rut!);

    const res = await caseUpdatesGET(
      authedGet(`http://test/api/v1/case-updates/${encoded}`),
      { params: { identifier: encoded } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.identifier).toBe(cliente.rut);
  });
});
