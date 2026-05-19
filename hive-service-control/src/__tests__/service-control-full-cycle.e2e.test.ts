import { describe, expect, it, vi, beforeEach, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { POST as paymentLinkPOST } from "@/app/api/internal/integration/clients/payment-link/route";
import { POST as casesPOST } from "@/app/api/internal/integration/cases/route";
import { POST as warningPOST } from "@/app/api/internal/integration/financial-warning/route";
import { POST as pagosPOST } from "@/app/api/v1/pagos/route";
import { _prisma } from "@/lib/db/_client";

/**
 * E2E completo del ciclo de vida service-control.
 *
 * Recorre la integración punta-a-punta entre los tres sistemas:
 *
 *   NEXIO/PagaCuotas → hive-financial-control → hive-service-control
 *
 * Flujo cubierto (un único `it` para mantener orden temporal):
 *   1. financial-control crea el enlace de PagaCuotas + password inicial.
 *   2. Cliente paga la cuota inicial en PagaCuotas → financial-control
 *      confirma vía POST /api/internal/integration/cases.
 *   3. Día 10 — financial-control emite WARNING_10 (recordatorio).
 *   4. Día 20 — WARNING_20 (aviso crítico, sin corte).
 *   5. Día 30 — WARNING_30 → forceHalt + user.active = false.
 *   6. Cliente paga la cuota atrasada en PagaCuotas → financial-control
 *      (hoy llamado "fincial control" en el dominio del cliente) notifica
 *      el pago al endpoint contable POST /api/v1/pagos con estado PAID.
 *   7. service-control reactiva el caso (HALTED_BY_PAYMENT → OPEN) y
 *      reactiva la cuenta del cliente (user.active = true).
 */

// Notificaciones (WhatsApp + Email) son side-effects externos. Mockeamos
// para validar que se *encolan* con el payload correcto sin enviar nada
// físicamente. Mockeamos también next/cache para evitar runtime de Next.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const enqueueWhatsAppMock = vi.fn();
const enqueueEmailMock = vi.fn();
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

const INTERNAL_KEY = "test-internal-key";
const EXTERNAL_KEY = "external-test-key";

const PAYMENT_LINK_URL = "http://test/api/internal/integration/clients/payment-link";
const CASES_URL = "http://test/api/internal/integration/cases";
const WARNING_URL = "http://test/api/internal/integration/financial-warning";
const PAGOS_URL = "http://test/api/v1/pagos";

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

function externalPost(url: string, body: unknown, key = EXTERNAL_KEY) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
}

beforeAll(() => {
  vi.stubEnv("EXTERNAL_API_KEY", EXTERNAL_KEY);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  enqueueWhatsAppMock.mockReset();
  enqueueEmailMock.mockReset();
});

describe("E2E service-control — ciclo punta a punta (NEXIO → financial → service)", () => {
  it("ingresa caso → notifica día 10 → advierte día 20 → corta día 30 → reactiva al pagar", async () => {
    const RUT_FORMATEADO = "13.572.468-K";
    const RUT_NORMALIZADO = "13572468-k";
    const EMAIL = "fullcycle@cliente.cl";
    const TELEFONO = "+56987654321";
    const PASSWORD_INICIAL = "INIT9X2K";
    const PAY_LINK = "https://pagacuotas.cl/c/full-cycle";
    const CASE_CODE = "AT-FULL-001";

    // ─────────────────────────────────────────────────────────────────
    // 1. financial-control empuja el enlace de PagaCuotas + password.
    //    service-control crea el ghost user con credenciales hasheadas
    //    y mustChangePassword = true.
    // ─────────────────────────────────────────────────────────────────
    const resLink = await paymentLinkPOST(
      internalPost(PAYMENT_LINK_URL, {
        rut: RUT_FORMATEADO,
        nombre: "Cliente Full Cycle",
        email: EMAIL,
        telefono: TELEFONO,
        payment_link: PAY_LINK,
        password_plain: PASSWORD_INICIAL,
        crm_lead_id: 808,
        correlation_id: "full-corr-1",
      }),
    );
    expect(resLink.status).toBe(200);

    const userAfterLink = await _prisma.user.findFirst({
      where: { rut: RUT_NORMALIZADO },
    });
    expect(userAfterLink).not.toBeNull();
    expect(userAfterLink!.role).toBe("CLIENTE");
    expect(userAfterLink!.mustChangePassword).toBe(true);
    expect(userAfterLink!.active).toBe(true);
    expect(userAfterLink!.paymentLink).toBe(PAY_LINK);
    expect(
      await bcrypt.compare(PASSWORD_INICIAL, userAfterLink!.passwordHash),
    ).toBe(true);

    // ─────────────────────────────────────────────────────────────────
    // 2. Cliente paga la cuota inicial en PagaCuotas. financial-control
    //    confirma → service-control crea el caso (OPEN, is_paid=true) y
    //    adjunta la OT inicial como Update.
    // ─────────────────────────────────────────────────────────────────
    const resCase = await casesPOST(
      internalPost(CASES_URL, {
        rut: RUT_FORMATEADO,
        nombre: "Cliente Full Cycle",
        email: EMAIL,
        telefono: TELEFONO,
        password_plain: PASSWORD_INICIAL,
        case_code: CASE_CODE,
        service_category: "CIVIL",
        crm_lead_id: 808,
        correlation_id: "full-corr-1",
        initial_payment_amount: 300000,
        contrato_id_sis_contable: 9101,
        payment_link: PAY_LINK,
        source: "NEXIO",
        financials: {
          honorarios: 1800000,
          cuota_inicial: 300000,
          num_cuotas: 6,
          monto_cuota: 250000,
        },
        team: { vendedor: "Marcela", agendadora: "Camila" },
        work_order: {
          id: 601,
          type: "DEMANDA_INICIAL",
          created_at: "2025-05-01T10:00:00Z",
          document_url: "https://nexio.cl/docs/ot-601.pdf",
          fields: { abogado: "Pedro", urgencia: "media" },
        },
      }),
    );
    expect(resCase.status).toBe(201);

    const kase = await _prisma.case.findUnique({ where: { code: CASE_CODE } });
    expect(kase).not.toBeNull();
    expect(kase!.is_paid).toBe(true);
    expect(kase!.stage).toBe("OPEN");
    expect(kase!.client_id).toBe(userAfterLink!.id);

    const updates = await _prisma.update.findMany({
      where: { caseId: kase!.id },
    });
    expect(updates).toHaveLength(1);
    expect(updates[0].document_url).toBe("https://nexio.cl/docs/ot-601.pdf");
    expect(updates[0].description).toContain("[OT/CIVIL] DEMANDA_INICIAL");

    // ─────────────────────────────────────────────────────────────────
    // 3. Día 10 — WARNING_10: recordatorio WhatsApp + Email.
    //    Caso permanece OPEN, cuenta activa.
    // ─────────────────────────────────────────────────────────────────
    const payloadWarningBase = {
      source: "hive-financial-control",
      cliente: {
        id: 200,
        rut: RUT_FORMATEADO,
        nombre: "Cliente Full Cycle",
        email: EMAIL,
        telefono: TELEFONO,
      },
      contrato: { id: 9101, external_id: "C-9101", estado: "ACTIVO" },
      cuota: {
        id: 7001,
        numero_cuota: 1,
        fecha_vencimiento: "2025-05-10",
      },
    };

    enqueueWhatsAppMock.mockClear();
    enqueueEmailMock.mockClear();
    const resW10 = await warningPOST(
      internalPost(WARNING_URL, {
        ...payloadWarningBase,
        warning_id: 1,
        level: "WARNING_10",
        dias_atraso: 10,
      }),
    );
    expect(resW10.status).toBe(200);
    expect(enqueueWhatsAppMock).toHaveBeenCalledWith({
      kind: "non_payment_warning",
      caseId: kase!.id,
    });
    expect(enqueueEmailMock).toHaveBeenCalledWith({
      kind: "non_payment_warning",
      caseId: kase!.id,
    });

    const audit10 = await _prisma.auditLog.findFirst({
      where: {
        action: "EMAIL_SENT",
        caseId: kase!.id,
        message: { contains: "Warning 10" },
      },
    });
    expect(audit10).not.toBeNull();

    const kaseAfterW10 = await _prisma.case.findUnique({
      where: { id: kase!.id },
    });
    expect(kaseAfterW10!.stage).toBe("OPEN");
    const userAfterW10 = await _prisma.user.findUnique({
      where: { id: userAfterLink!.id },
    });
    expect(userAfterW10!.active).toBe(true);

    // ─────────────────────────────────────────────────────────────────
    // 4. Día 20 — WARNING_20: aviso crítico. Aún sin corte.
    // ─────────────────────────────────────────────────────────────────
    enqueueWhatsAppMock.mockClear();
    enqueueEmailMock.mockClear();
    const resW20 = await warningPOST(
      internalPost(WARNING_URL, {
        ...payloadWarningBase,
        warning_id: 2,
        level: "WARNING_20",
        dias_atraso: 20,
      }),
    );
    expect(resW20.status).toBe(200);
    expect(enqueueWhatsAppMock).toHaveBeenCalledWith({
      kind: "overdue_notice",
      caseId: kase!.id,
    });
    expect(enqueueEmailMock).toHaveBeenCalledWith({
      kind: "overdue_notice",
      caseId: kase!.id,
    });

    const audit20 = await _prisma.auditLog.findFirst({
      where: {
        action: "EMAIL_SENT",
        caseId: kase!.id,
        message: { contains: "Warning 20" },
      },
    });
    expect(audit20).not.toBeNull();

    const kaseAfterW20 = await _prisma.case.findUnique({
      where: { id: kase!.id },
    });
    expect(kaseAfterW20!.stage).toBe("OPEN");
    expect(kaseAfterW20!.halted_at).toBeNull();
    const userAfterW20 = await _prisma.user.findUnique({
      where: { id: userAfterLink!.id },
    });
    expect(userAfterW20!.active).toBe(true);

    // ─────────────────────────────────────────────────────────────────
    // 5. Día 30 — WARNING_30: forceHalt + user.active = false.
    // ─────────────────────────────────────────────────────────────────
    enqueueWhatsAppMock.mockClear();
    enqueueEmailMock.mockClear();
    const resW30 = await warningPOST(
      internalPost(WARNING_URL, {
        ...payloadWarningBase,
        warning_id: 3,
        level: "WARNING_30",
        dias_atraso: 30,
      }),
    );
    expect(resW30.status).toBe(200);

    const kaseHalted = await _prisma.case.findUnique({
      where: { id: kase!.id },
    });
    expect(kaseHalted!.stage).toBe("HALTED_BY_PAYMENT");
    expect(kaseHalted!.halted_at).not.toBeNull();
    expect(kaseHalted!.halted_reason).toMatch(/Mora 30 días/);

    const userHalted = await _prisma.user.findUnique({
      where: { id: userAfterLink!.id },
    });
    expect(userHalted!.active).toBe(false);

    const auditHalt = await _prisma.auditLog.findFirst({
      where: { action: "CASE_HALTED", caseId: kase!.id },
    });
    expect(auditHalt).not.toBeNull();

    // ─────────────────────────────────────────────────────────────────
    // 6. Cliente paga la cuota atrasada en PagaCuotas. El sistema
    //    contable (hive-financial-control) notifica el pago al endpoint
    //    /api/v1/pagos con estado PAID → service-control gatilla
    //    reactivateCaseIfPaid.
    // ─────────────────────────────────────────────────────────────────
    enqueueWhatsAppMock.mockClear();
    enqueueEmailMock.mockClear();
    const resPago = await pagosPOST(
      externalPost(PAGOS_URL, {
        caso_id: kase!.id,
        estado: "PAID",
        monto: 250000,
        monto_pagado: 250000,
        numero_cuota: 1,
        fecha_pago: "2025-06-05T12:00:00Z",
        comprobante: "https://pagacuotas.cl/r/full-cycle-1",
        referencia: "REC-FC-1",
      }),
    );
    expect(resPago.status).toBe(200);
    const pagoBody = await resPago.json();
    expect(pagoBody.success).toBe(true);
    expect(pagoBody.caso_reactivado).toBe(true);

    // ─────────────────────────────────────────────────────────────────
    // 7. Verificación final: caso reactivado y cuenta del cliente
    //    nuevamente activa. Stage → OPEN porque aún no hay abogados
    //    asignados (per diagrama, vuelve al nodo de validación).
    // ─────────────────────────────────────────────────────────────────
    const kaseReactivado = await _prisma.case.findUnique({
      where: { id: kase!.id },
    });
    expect(kaseReactivado!.stage).toBe("OPEN");
    expect(kaseReactivado!.is_paid).toBe(true);
    expect(kaseReactivado!.halted_at).toBeNull();
    expect(kaseReactivado!.halted_reason).toBeNull();
    expect(kaseReactivado!.unpaid_months).toBe(0);

    const userReactivado = await _prisma.user.findUnique({
      where: { id: userAfterLink!.id },
    });
    expect(userReactivado!.active).toBe(true);

    const auditReactivado = await _prisma.auditLog.findFirst({
      where: { action: "CASE_REACTIVATED", caseId: kase!.id },
    });
    expect(auditReactivado).not.toBeNull();

    // PaymentEvent registrado con monto y comprobante.
    const paymentEvents = await _prisma.paymentEvent.findMany({
      where: { caseId: kase!.id },
    });
    expect(paymentEvents).toHaveLength(1);
    expect(paymentEvents[0].status).toBe("PAID");
    expect(paymentEvents[0].numero_cuota).toBe(1);
    expect(paymentEvents[0].receipt_url).toBe(
      "https://pagacuotas.cl/r/full-cycle-1",
    );

    // Notificación de recibo encolada al reactivar.
    expect(enqueueWhatsAppMock).toHaveBeenCalledWith({
      kind: "payment_receipt",
      caseId: kase!.id,
    });
  });

  it("pago PAID idempotente: segunda notificación sobre la misma cuota no duplica PaymentEvent", async () => {
    // Seed mínimo: cliente + caso halteado.
    const cliente = await _prisma.user.create({
      data: {
        fullName: "Idem Pago",
        email: "idem-pago@cliente.cl",
        phone: "+56900111222",
        role: "CLIENTE",
        passwordHash: await bcrypt.hash("Algo1234", 12),
        rut: "55555555-5",
        active: false,
        mustChangePassword: true,
      },
    });
    const cat = await _prisma.category.create({ data: { name: "CIVIL" } });
    const kase = await _prisma.case.create({
      data: {
        code: "AT-IDEM-PAGO-001",
        client_id: cliente.id,
        categoryId: cat.id,
        stage: "HALTED_BY_PAYMENT",
        halted_at: new Date(),
        halted_reason: "Mora 30 días",
        is_paid: false,
      },
    });

    const basePayload = {
      caso_id: kase.id,
      estado: "PAID" as const,
      monto: 250000,
      monto_pagado: 250000,
      numero_cuota: 1,
      fecha_pago: "2025-06-10T10:00:00Z",
    };

    const r1 = await pagosPOST(externalPost(PAGOS_URL, basePayload));
    expect(r1.status).toBe(200);

    const r2 = await pagosPOST(externalPost(PAGOS_URL, basePayload));
    expect(r2.status).toBe(200);

    const events = await _prisma.paymentEvent.findMany({
      where: { caseId: kase.id, numero_cuota: 1 },
    });
    expect(events).toHaveLength(1);
  });

  it("/api/v1/pagos rechaza Bearer inválido (401)", async () => {
    const res = await pagosPOST(
      externalPost(
        PAGOS_URL,
        {
          caso_id: "00000000-0000-0000-0000-000000000000",
          estado: "PAID",
          monto: 100,
        },
        "bearer-malo",
      ),
    );
    expect(res.status).toBe(401);
  });

  it("/api/v1/pagos OVERDUE sobre caso vivo gatilla forceHalt", async () => {
    const cliente = await _prisma.user.create({
      data: {
        fullName: "Cae a halt",
        email: "halt@cliente.cl",
        phone: "+56900333444",
        role: "CLIENTE",
        passwordHash: await bcrypt.hash("Algo1234", 12),
        rut: "66666666-6",
        active: true,
        mustChangePassword: false,
      },
    });
    const cat = await _prisma.category.create({ data: { name: "LABORAL" } });
    const kase = await _prisma.case.create({
      data: {
        code: "AT-HALT-OVERDUE-001",
        client_id: cliente.id,
        categoryId: cat.id,
        stage: "OPEN",
        is_paid: true,
      },
    });

    const res = await pagosPOST(
      externalPost(PAGOS_URL, {
        caso_id: kase.id,
        estado: "OVERDUE",
        monto: 250000,
        numero_cuota: 2,
      }),
    );
    expect(res.status).toBe(200);

    const kaseHalted = await _prisma.case.findUnique({
      where: { id: kase.id },
    });
    expect(kaseHalted!.stage).toBe("HALTED_BY_PAYMENT");
    expect(kaseHalted!.halted_reason).toMatch(/contabilidad/);
  });
});
