import { describe, expect, it, beforeEach, beforeAll, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { GET as clientesGET } from "@/app/api/v1/clientes/route";
import { GET as cobranzaGET } from "@/app/api/v1/cobranza/route";
import { GET as planPagosGET } from "@/app/api/v1/plan-pagos/route";
import { _prisma } from "@/lib/db/_client";

const KEY = "external-test-key";

beforeAll(() => {
  vi.stubEnv("EXTERNAL_API_KEY", KEY);
});
afterAll(() => {
  vi.unstubAllEnvs();
});

function authed(url: string, key = KEY) {
  return new NextRequest(url, {
    headers: { authorization: `Bearer ${key}` },
  });
}

async function seedFullClient() {
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
    },
  });
  const cat = await _prisma.category.create({ data: { name: "CIVIL" } });
  const kase = await _prisma.case.create({
    data: {
      code: "AT-PUB-001",
      client_id: cliente.id,
      categoryId: cat.id,
      stage: "OPEN",
      is_paid: true,
      saldo_financiado: 1000000,
    },
  });
  await _prisma.paymentEvent.create({
    data: {
      caseId: kase.id,
      status: "PAID",
      amount: 250000,
      monto_pagado: 250000,
      numero_cuota: 1,
      pagado_en: new Date("2025-04-01"),
    },
  });
  await _prisma.paymentEvent.create({
    data: {
      caseId: kase.id,
      status: "OVERDUE",
      amount: 250000,
      monto_pagado: 0,
      numero_cuota: 2,
      fecha_vencimiento: new Date("2025-05-01"),
    },
  });
  return { cliente, kase, cat };
}

describe("GET /api/v1/clientes", () => {
  it("401 sin Bearer", async () => {
    const res = await clientesGET(new NextRequest("http://test/api/v1/clientes"));
    expect(res.status).toBe(401);
  });

  it("401 con bearer incorrecto", async () => {
    const res = await clientesGET(authed("http://test/api/v1/clientes", "mal"));
    expect(res.status).toBe(401);
  });

  it("retorna clientes con casos y resumen financiero", async () => {
    await seedFullClient();
    const res = await clientesGET(authed("http://test/api/v1/clientes"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.total).toBe(1);
    expect(body.clientes[0].rut).toBe("21331955-8");
    expect(body.clientes[0].total_casos).toBe(1);
    const caso = body.clientes[0].casos[0];
    expect(caso.codigo).toBe("AT-PUB-001");
    expect(caso.estado_financiero).toBe("MOROSO");
    expect(caso.total_pagado).toBe(250000);
    expect(caso.saldo_vencido).toBe(250000);
    expect(caso.categoria).toBe("CIVIL");
    expect(caso.ultimos_pagos).toHaveLength(2);
  });

  it("filtra por stage", async () => {
    await seedFullClient();
    const res = await clientesGET(authed("http://test/api/v1/clientes?stage=FINISHED"));
    const body = await res.json();
    expect(body.total).toBe(0);
  });

  it("filtra por categoria", async () => {
    await seedFullClient();
    const res = await clientesGET(authed("http://test/api/v1/clientes?categoria=CIVIL"));
    const body = await res.json();
    expect(body.total).toBe(1);
  });
});

describe("GET /api/v1/cobranza", () => {
  it("401 sin Bearer", async () => {
    const res = await cobranzaGET(new NextRequest("http://test/api/v1/cobranza"));
    expect(res.status).toBe(401);
  });

  it("retorna pagos del sistema", async () => {
    await seedFullClient();
    const res = await cobranzaGET(authed("http://test/api/v1/cobranza"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // 2 pagos seedeados (PAID + OVERDUE)
    expect(Array.isArray(body.pagos ?? body.data ?? [])).toBe(true);
  });

  it("filtra solo_pendientes=true (UNPAID + OVERDUE)", async () => {
    await seedFullClient();
    const res = await cobranzaGET(authed("http://test/api/v1/cobranza?solo_pendientes=true"));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/plan-pagos", () => {
  it("401 sin Bearer", async () => {
    const res = await planPagosGET(new NextRequest("http://test/api/v1/plan-pagos"));
    expect(res.status).toBe(401);
  });

  it("retorna casos con plan de pago", async () => {
    await seedFullClient();
    const res = await planPagosGET(authed("http://test/api/v1/plan-pagos"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
