import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as paymentNeededPOST } from "@/app/api/integration/payment-needed/route";
import { POST as paymentLinkPOST } from "@/app/api/internal/integration/clients/payment-link/route";
import { POST as casesPOST } from "@/app/api/internal/integration/cases/route";
import { POST as warningPOST } from "@/app/api/internal/integration/financial-warning/route";
import { GET as clientesGET } from "@/app/api/v1/clientes/route";
import { GET as cobranzaGET } from "@/app/api/v1/cobranza/route";
import { GET as planPagosGET } from "@/app/api/v1/plan-pagos/route";
import { GET as caseUpdatesGET } from "@/app/api/v1/case-updates/[identifier]/route";
import { POST as crmWebhookPOST } from "@/app/api/webhooks/crm/route";
import { POST as flowWebhookPOST } from "@/app/api/webhooks/flow/route";
import { POST as webpayWebhookPOST } from "@/app/api/webhooks/webpay/route";
import { _prisma } from "@/lib/db/_client";

const dispatchMocks = vi.hoisted(() => ({
  processWhatsAppJob: vi.fn(),
  processEmailJob: vi.fn(),
}));

vi.mock("@/lib/processing/dispatch", () => ({
  processWhatsAppJob: dispatchMocks.processWhatsAppJob,
  processEmailJob: dispatchMocks.processEmailJob,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const INTERNAL_KEY = "test-internal-key";
const INGEST_SECRET = "test-ingest-secret";
const EXTERNAL_KEY = "external-contract-key";

function internalPost(url: string, body: unknown, key = INTERNAL_KEY) {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify(body),
  });
}

function ingestPost(url: string, body: unknown, secret = INGEST_SECRET) {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-integration-secret": secret,
    },
    body: JSON.stringify(body),
  });
}

function publicGet(url: string, key = EXTERNAL_KEY) {
  return new NextRequest(url, {
    headers: { authorization: `Bearer ${key}` },
  });
}

async function expectJson(res: Response, status: number) {
  expect(res.status).toBe(status);
  return res.json();
}

async function seedOperatorUsers() {
  const admin = await _prisma.user.create({
    data: {
      fullName: "Admin Integracion",
      email: "admin.integracion@test.cl",
      phone: "+56910000001",
      role: "SUPER_ADMIN",
      passwordHash: "hash",
      active: true,
    },
  });

  const abogado = await _prisma.user.create({
    data: {
      fullName: "Abogado Integracion",
      email: "abogado.integracion@test.cl",
      phone: "+56910000002",
      role: "ABOGADO",
      passwordHash: "hash",
      active: true,
    },
  });

  return { admin, abogado };
}

describe("project integrations contract", () => {
  beforeEach(() => {
    vi.stubEnv("EXTERNAL_API_KEY", EXTERNAL_KEY);
    vi.stubEnv("PROCESSING_MODE", "inline");
    dispatchMocks.processWhatsAppJob.mockReset();
    dispatchMocks.processEmailJob.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("runs the integration surfaces with uniform contracts and best-effort side effects", async () => {
    const { admin, abogado } = await seedOperatorUsers();
    const rut = "55.555.555-5";
    const normalizedRut = "55555555-5";
    const email = "cliente.integracion@test.cl";
    const phone = "+56920000001";
    const caseCode = "AT-CONTRACT-001";
    const paymentLink = "https://pagacuotas.cl/c/contract-001";
    const initialPassword = "TmpPass9";

    const lead = await _prisma.lead.create({
      data: {
        fullName: "Cliente Integracion",
        email,
        phone,
        externalId: "90001",
        assignedAbogadoId: abogado.id,
        meetingAt: new Date("2026-01-10T15:00:00Z"),
        status: "PAGO_COMPROMETIDO",
      },
    });

    const paymentNeeded = await expectJson(
      await paymentNeededPOST(
        ingestPost("http://test/api/integration/payment-needed", {
          crmLeadId: 90001,
          fullName: "Cliente Integracion",
          honorarios: 1800000,
          invoiceUrl: "https://nexio.cl/invoices/90001.pdf",
        }),
      ),
      200,
    );
    expect(paymentNeeded).toEqual({ ok: true });
    const adminNotification = await _prisma.notification.findFirst({
      where: { userId: admin.id, leadId: lead.id },
    });
    expect(adminNotification?.title).toContain("Pago comprometido");

    const linkBody = await expectJson(
      await paymentLinkPOST(
        internalPost("http://test/api/internal/integration/clients/payment-link", {
          rut,
          nombre: "Cliente Integracion",
          email,
          telefono: phone,
          payment_link: paymentLink,
          password_plain: initialPassword,
          crm_lead_id: 90001,
          correlation_id: "contract-001",
        }),
      ),
      200,
    );
    expect(linkBody).toMatchObject({ ok: true });
    expect(typeof linkBody.clientId).toBe("string");

    const caseBody = await expectJson(
      await casesPOST(
        internalPost("http://test/api/internal/integration/cases", {
          rut,
          nombre: "Cliente Integracion",
          email,
          telefono: phone,
          password_plain: initialPassword,
          case_code: caseCode,
          service_category: "CIVIL",
          crm_lead_id: 90001,
          correlation_id: "contract-001",
          initial_payment_amount: 300000,
          contrato_id_sis_contable: 91001,
          payment_link: paymentLink,
          source: "NEXIO",
          financials: {
            honorarios: 1800000,
            cuota_inicial: 300000,
            num_cuotas: 6,
            monto_cuota: 250000,
          },
          team: { vendedor: "Ventas", agendadora: "Agenda" },
          work_order: {
            id: 91001,
            type: "DEMANDA_INICIAL",
            created_at: "2026-01-11T12:00:00Z",
            document_url: "https://nexio.cl/docs/ot-91001.pdf",
            fields: { abogado: "Abogado Integracion", urgencia: "alta" },
          },
        }),
      ),
      201,
    );
    expect(caseBody).toMatchObject({ ok: true, wasCreated: true });
    expect(typeof caseBody.caseId).toBe("string");

    const duplicateCaseBody = await expectJson(
      await casesPOST(
        internalPost("http://test/api/internal/integration/cases", {
          rut,
          nombre: "Cliente Integracion",
          email,
          telefono: phone,
          password_plain: initialPassword,
          case_code: caseCode,
          service_category: "CIVIL",
          payment_link: paymentLink,
          source: "NEXIO",
        }),
      ),
      200,
    );
    expect(duplicateCaseBody).toMatchObject({ ok: true, wasCreated: false });
    await expect(_prisma.case.count({ where: { code: caseCode } })).resolves.toBe(1);
    await expect(_prisma.user.count({ where: { rut: normalizedRut } })).resolves.toBe(1);

    await _prisma.case.update({
      where: { id: caseBody.caseId },
      data: {
        ccto: 1800000,
        pago_inicial: 300000,
        saldo_financiado: 1500000,
        cantidad_cuotas: 6,
        fecha_primera_cuota: new Date("2026-02-01T00:00:00Z"),
        dia_pago: 5,
      },
    });
    await _prisma.paymentEvent.createMany({
      data: [
        {
          caseId: caseBody.caseId,
          status: "PAID",
          amount: 300000,
          monto_pagado: 300000,
          numero_cuota: 0,
          pagado_en: new Date("2026-01-11T12:30:00Z"),
          receipt_url: "https://pagacuotas.cl/receipts/0.pdf",
        },
        {
          caseId: caseBody.caseId,
          status: "OVERDUE",
          amount: 250000,
          monto_pagado: 0,
          numero_cuota: 1,
          fecha_vencimiento: new Date("2026-02-05T00:00:00Z"),
        },
      ],
    });

    const clientesBody = await expectJson(
      await clientesGET(publicGet("http://test/api/v1/clientes?categoria=CIVIL")),
      200,
    );
    expect(clientesBody).toMatchObject({ success: true, total: 1 });
    expect(clientesBody.clientes[0].casos[0]).toMatchObject({
      codigo: caseCode,
      estado_financiero: "MOROSO",
      saldo_vencido: 250000,
    });

    const cobranzaBody = await expectJson(
      await cobranzaGET(publicGet("http://test/api/v1/cobranza?solo_pendientes=true")),
      200,
    );
    expect(cobranzaBody).toMatchObject({ success: true });
    expect(cobranzaBody.resumen.por_estado.OVERDUE).toMatchObject({
      cantidad: 1,
      monto: 250000,
    });

    const planBody = await expectJson(
      await planPagosGET(publicGet(`http://test/api/v1/plan-pagos?caso_id=${caseBody.caseId}`)),
      200,
    );
    expect(planBody).toMatchObject({ success: true, total: 1 });
    expect(planBody.planes[0].contrato).toMatchObject({
      cantidad_cuotas: 6,
      saldo_vencido: 250000,
    });

    const updatesBody = await expectJson(
      await caseUpdatesGET(
        publicGet(`http://test/api/v1/case-updates/${encodeURIComponent(normalizedRut)}`),
        { params: { identifier: normalizedRut } },
      ),
      200,
    );
    expect(updatesBody).toMatchObject({ success: true, identifier: normalizedRut });
    expect(updatesBody.cases[0]).toMatchObject({
      code: caseCode,
      total_updates: 1,
    });

    dispatchMocks.processWhatsAppJob.mockRejectedValue(new Error("provider throttled"));
    dispatchMocks.processEmailJob.mockRejectedValue(new Error("provider throttled"));

    const warning10 = await expectJson(
      await warningPOST(
        internalPost("http://test/api/internal/integration/financial-warning", {
          source: "hive-financial-control",
          warning_id: 1010,
          level: "WARNING_10",
          dias_atraso: 10,
          cliente: { id: 90001, rut, nombre: "Cliente Integracion", email, telefono: phone },
          contrato: { id: 91001, external_id: "C-91001", estado: "ACTIVO" },
          cuota: { id: 50010, numero_cuota: 1, fecha_vencimiento: "2026-02-05" },
        }),
      ),
      200,
    );
    expect(warning10).toMatchObject({ ok: true, matched: true, caseCode });

    const warning30 = await expectJson(
      await warningPOST(
        internalPost("http://test/api/internal/integration/financial-warning", {
          source: "hive-financial-control",
          warning_id: 1030,
          level: "WARNING_30",
          dias_atraso: 30,
          cliente: { id: 90001, rut, nombre: "Cliente Integracion", email, telefono: phone },
          contrato: { id: 91001, external_id: "C-91001", estado: "ACTIVO" },
          cuota: { id: 50010, numero_cuota: 1, fecha_vencimiento: "2026-02-05" },
        }),
      ),
      200,
    );
    expect(warning30).toMatchObject({ ok: true, matched: true, caseCode });
    expect(dispatchMocks.processWhatsAppJob).toHaveBeenCalled();
    expect(dispatchMocks.processEmailJob).toHaveBeenCalled();

    const haltedCase = await _prisma.case.findUnique({ where: { id: caseBody.caseId } });
    expect(haltedCase?.stage).toBe("HALTED_BY_PAYMENT");
    expect(haltedCase?.halted_at).toBeInstanceOf(Date);
    const haltedUser = await _prisma.user.findUnique({ where: { id: linkBody.clientId } });
    expect(haltedUser?.active).toBe(false);
  });

  it("keeps unsafe legacy payment webhooks disabled", async () => {
    const before = await _prisma.paymentEvent.count();

    const crmBody = await expectJson(await crmWebhookPOST(), 410);
    expect(crmBody).toMatchObject({ ok: false });

    const flowBody = await expectJson(
      await flowWebhookPOST(
        new NextRequest("http://test/api/webhooks/flow", {
          method: "POST",
          body: JSON.stringify({ token: "fake" }),
        }),
      ),
      503,
    );
    expect(flowBody).toMatchObject({ ok: false });

    const webpayBody = await expectJson(
      await webpayWebhookPOST(
        new NextRequest("http://test/api/webhooks/webpay", {
          method: "POST",
          body: JSON.stringify({ token_ws: "fake" }),
        }),
      ),
      503,
    );
    expect(webpayBody).toMatchObject({ ok: false });

    await expect(_prisma.paymentEvent.count()).resolves.toBe(before);
  });
});
