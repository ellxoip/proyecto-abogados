import { describe, expect, it, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { POST as paymentLinkPOST } from "@/app/api/internal/integration/clients/payment-link/route";
import { POST as casesPOST } from "@/app/api/internal/integration/cases/route";
import { POST as warningPOST } from "@/app/api/internal/integration/financial-warning/route";
import { _prisma } from "@/lib/db/_client";

// Mocks: las notificaciones (WhatsApp + Email) son side-effects externos.
// En el e2e queremos asegurar que se *encolan* con el payload correcto,
// no que se envíen físicamente.
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

// Mock auth() — login del cliente al final del flujo (rotación de password).
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
}));
const { changeOwnPassword } = await import("@/app/portal/cambiar-password/actions");

const PAYMENT_LINK_URL = "http://test/api/internal/integration/clients/payment-link";
const CASES_URL = "http://test/api/internal/integration/cases";
const WARNING_URL = "http://test/api/internal/integration/financial-warning";

function authedPost(url: string, body: unknown, key = "test-internal-key") {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify(body),
  });
}

function unauthedPost(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  enqueueWhatsAppMock.mockReset();
  enqueueEmailMock.mockReset();
  authMock.mockReset();
});

describe("E2E service-control — ciclo de vida completo", () => {
  it("onboarding → pago → mora 10 → mora 20 → mora 30 → halt + deactivate", async () => {
    const RUT_FORMATEADO = "12.345.678-9";
    const RUT_NORMALIZADO = "12345678-9";
    const PASSWORD_INICIAL = "INIT9X2K";
    const PAY_LINK = "https://pagacuotas.cl/c/e2e-flow";
    const CASE_CODE = "AT-E2E-001";

    // ── 1. financial-control empuja el enlace de PagaCuotas + password
    //       generada. service-control crea el ghost user con credenciales
    //       hasheadas y mustChangePassword=true.
    const resLink = await paymentLinkPOST(
      authedPost(PAYMENT_LINK_URL, {
        rut: RUT_FORMATEADO,
        nombre: "Cliente E2E",
        email: "e2e@cliente.cl",
        telefono: "+56911223344",
        payment_link: PAY_LINK,
        password_plain: PASSWORD_INICIAL,
        crm_lead_id: 777,
        correlation_id: "e2e-corr-1",
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
    expect(await bcrypt.compare(PASSWORD_INICIAL, userAfterLink!.passwordHash)).toBe(true);

    // Audit del payment-link.
    const auditLink = await _prisma.auditLog.findFirst({
      where: { action: "PAYMENT_RECORDED", actorId: userAfterLink!.id },
    });
    expect(auditLink).not.toBeNull();

    // ── 2. Cliente paga la cuota inicial en PagaCuotas → financial-control
    //       confirma vía /cases. Crea el caso (stage OPEN, is_paid=true) y
    //       adjunta la OT inicial como Update.
    const resCase = await casesPOST(
      authedPost(CASES_URL, {
        rut: RUT_FORMATEADO,
        nombre: "Cliente E2E",
        email: "e2e@cliente.cl",
        telefono: "+56911223344",
        password_plain: PASSWORD_INICIAL,
        case_code: CASE_CODE,
        service_category: "CIVIL",
        crm_lead_id: 777,
        correlation_id: "e2e-corr-1",
        initial_payment_amount: 300000,
        contrato_id_sis_contable: 9001,
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
          id: 501,
          type: "DEMANDA_INICIAL",
          created_at: "2025-05-01T10:00:00Z",
          document_url: "https://nexio.cl/docs/ot-501.pdf",
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

    // OT adjunta.
    const updates = await _prisma.update.findMany({ where: { caseId: kase!.id } });
    expect(updates).toHaveLength(1);
    expect(updates[0].document_url).toBe("https://nexio.cl/docs/ot-501.pdf");
    expect(updates[0].description).toContain("[OT/CIVIL] DEMANDA_INICIAL");
    expect(updates[0].description).toContain("abogado: Pedro");

    // Category creada.
    const cat = await _prisma.category.findUnique({ where: { name: "CIVIL" } });
    expect(cat).not.toBeNull();

    // Metadata mergeada en el caso.
    const meta = JSON.parse(kase!.metadata ?? "{}");
    expect(meta.source).toBe("NEXIO");
    expect(meta.financials.num_cuotas).toBe(6);

    // ── 3. Cliente rota su password en /portal/cambiar-password.
    authMock.mockResolvedValue({ user: { id: userAfterLink!.id, role: "CLIENTE" } });
    const PASSWORD_NUEVA = "MiClaveSegura1";
    const rotateRes = await changeOwnPassword({
      currentPassword: PASSWORD_INICIAL,
      newPassword: PASSWORD_NUEVA,
      confirmPassword: PASSWORD_NUEVA,
    });
    expect(rotateRes).toEqual({ ok: true });

    const userRotado = await _prisma.user.findUnique({ where: { id: userAfterLink!.id } });
    expect(userRotado!.mustChangePassword).toBe(false);
    expect(await bcrypt.compare(PASSWORD_NUEVA, userRotado!.passwordHash)).toBe(true);
    expect(await bcrypt.compare(PASSWORD_INICIAL, userRotado!.passwordHash)).toBe(false);

    const auditRotacion = await _prisma.auditLog.findFirst({
      where: { action: "PASSWORD_CHANGED", actorId: userAfterLink!.id },
    });
    expect(auditRotacion).not.toBeNull();

    // ── 4. financial-control emite WARNING_10 (cuota 1 atrasada 10 días)
    //       → service-control encola recordatorio WhatsApp + Email.
    enqueueWhatsAppMock.mockClear();
    enqueueEmailMock.mockClear();

    const payloadWarningBase = {
      source: "hive-financial-control",
      warning_id: 1,
      dias_atraso: 10,
      cliente: {
        id: 100,
        rut: RUT_FORMATEADO,
        nombre: "Cliente E2E",
        email: "e2e@cliente.cl",
        telefono: "+56911223344",
      },
      contrato: { id: 9001, external_id: "C-9001", estado: "ACTIVO" },
      cuota: {
        id: 5001,
        numero_cuota: 1,
        fecha_vencimiento: "2025-05-10",
      },
    };

    const resW10 = await warningPOST(
      authedPost(WARNING_URL, { ...payloadWarningBase, level: "WARNING_10" }),
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
      where: { action: "EMAIL_SENT", caseId: kase!.id, message: { contains: "Warning 10" } },
    });
    expect(audit10).not.toBeNull();

    // ── 5. WARNING_20 (cuota 1 atrasada 20 días) → aviso crítico.
    enqueueWhatsAppMock.mockClear();
    enqueueEmailMock.mockClear();

    const resW20 = await warningPOST(
      authedPost(WARNING_URL, {
        ...payloadWarningBase,
        level: "WARNING_20",
        dias_atraso: 20,
        warning_id: 2,
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

    // Caso aún activo (no halteado).
    const kaseW20 = await _prisma.case.findUnique({ where: { id: kase!.id } });
    expect(kaseW20!.stage).toBe("OPEN");
    expect(kaseW20!.halted_at).toBeNull();
    const userW20 = await _prisma.user.findUnique({ where: { id: userAfterLink!.id } });
    expect(userW20!.active).toBe(true);

    // ── 6. WARNING_30 → corte: forceHalt del caso + user.active=false.
    enqueueWhatsAppMock.mockClear();
    enqueueEmailMock.mockClear();

    const resW30 = await warningPOST(
      authedPost(WARNING_URL, {
        ...payloadWarningBase,
        level: "WARNING_30",
        dias_atraso: 30,
        warning_id: 3,
      }),
    );
    expect(resW30.status).toBe(200);

    const kaseHalted = await _prisma.case.findUnique({ where: { id: kase!.id } });
    expect(kaseHalted!.stage).toBe("HALTED_BY_PAYMENT");
    expect(kaseHalted!.halted_at).not.toBeNull();
    expect(kaseHalted!.halted_reason).toMatch(/Mora 30 días/);

    const userHalted = await _prisma.user.findUnique({ where: { id: userAfterLink!.id } });
    expect(userHalted!.active).toBe(false);

    const auditHalt = await _prisma.auditLog.findFirst({
      where: { action: "CASE_HALTED", caseId: kase!.id },
    });
    expect(auditHalt).not.toBeNull();

    // ── 7. Reintento defensivo de WARNING_30: caso ya HALTED, user ya
    //       inactivo. No re-haltea, no reactiva, solo reenvía notificación.
    enqueueWhatsAppMock.mockClear();
    const haltedAtBefore = kaseHalted!.halted_at;

    const resW30Retry = await warningPOST(
      authedPost(WARNING_URL, {
        ...payloadWarningBase,
        level: "WARNING_30",
        dias_atraso: 35,
        warning_id: 4,
      }),
    );
    expect(resW30Retry.status).toBe(200);
    expect(enqueueWhatsAppMock).toHaveBeenCalledWith({
      kind: "overdue_notice",
      caseId: kase!.id,
    });

    const kaseHaltedRetry = await _prisma.case.findUnique({ where: { id: kase!.id } });
    expect(kaseHaltedRetry!.stage).toBe("HALTED_BY_PAYMENT");
    expect(kaseHaltedRetry!.halted_at).toEqual(haltedAtBefore);
    const userRetry = await _prisma.user.findUnique({ where: { id: userAfterLink!.id } });
    expect(userRetry!.active).toBe(false);
  });

  it("rechaza llamadas sin x-api-key en todos los endpoints (401)", async () => {
    const payloadBase = {
      rut: "11111111-1",
      nombre: "X",
      email: "x@x.cl",
      telefono: "+56900000000",
      password_plain: "Algo1234",
      payment_link: "https://pagacuotas.cl/c/x",
    };

    const resLink = await paymentLinkPOST(unauthedPost(PAYMENT_LINK_URL, payloadBase));
    expect(resLink.status).toBe(401);

    const resCase = await casesPOST(
      unauthedPost(CASES_URL, { ...payloadBase, case_code: "AT-401" }),
    );
    expect(resCase.status).toBe(401);

    const resWarn = await warningPOST(
      unauthedPost(WARNING_URL, {
        level: "WARNING_10",
        dias_atraso: 1,
        cliente: { id: 1, rut: "11111111-1", nombre: "X" },
        contrato: { id: 1 },
        cuota: { id: 1, numero_cuota: 1, fecha_vencimiento: "2025-01-01" },
      }),
    );
    expect(resWarn.status).toBe(401);
  });

  it("rechaza payloads inválidos (422) — schema zod", async () => {
    // payment-link sin payment_link
    const resLink = await paymentLinkPOST(
      authedPost(PAYMENT_LINK_URL, {
        rut: "22222222-2",
        nombre: "Y",
        email: "y@y.cl",
        telefono: "+56900000000",
        password_plain: "Algo1234",
      }),
    );
    expect(resLink.status).toBe(422);

    // cases sin case_code
    const resCase = await casesPOST(
      authedPost(CASES_URL, {
        rut: "22222222-2",
        nombre: "Y",
        email: "y@y.cl",
        telefono: "+56900000000",
        password_plain: "Algo1234",
      }),
    );
    expect(resCase.status).toBe(422);

    // warning con level desconocido
    const resWarn = await warningPOST(
      authedPost(WARNING_URL, {
        level: "WARNING_99",
        dias_atraso: 1,
        cliente: { id: 1, rut: "22222222-2", nombre: "Y" },
        contrato: { id: 1 },
        cuota: { id: 1, numero_cuota: 1, fecha_vencimiento: "2025-01-01" },
      }),
    );
    expect(resWarn.status).toBe(422);
  });

  it("WARNING sobre cliente desconocido → 202 matched=false (sin side-effects)", async () => {
    const res = await warningPOST(
      authedPost(WARNING_URL, {
        level: "WARNING_10",
        dias_atraso: 5,
        cliente: {
          id: 99,
          rut: "99999999-9",
          nombre: "Fantasma",
          email: "fantasma@x.cl",
          telefono: "+56900000000",
        },
        contrato: { id: 1 },
        cuota: { id: 1, numero_cuota: 1, fecha_vencimiento: "2025-01-01" },
      }),
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.matched).toBe(false);
    expect(enqueueWhatsAppMock).not.toHaveBeenCalled();
    expect(enqueueEmailMock).not.toHaveBeenCalled();
  });

  it("WARNING sobre cliente sin casos activos → 202 matched=false", async () => {
    // Cliente sin caso asociado.
    await _prisma.user.create({
      data: {
        fullName: "Sin Caso",
        email: "sincaso@x.cl",
        phone: "+56900000111",
        role: "CLIENTE",
        passwordHash: await bcrypt.hash("Algo1234", 12),
        rut: "33333333-3",
        active: true,
        mustChangePassword: false,
      },
    });

    const res = await warningPOST(
      authedPost(WARNING_URL, {
        level: "WARNING_10",
        dias_atraso: 5,
        cliente: {
          id: 99,
          rut: "33333333-3",
          nombre: "Sin Caso",
          email: "sincaso@x.cl",
          telefono: "+56900000111",
        },
        contrato: { id: 1 },
        cuota: { id: 1, numero_cuota: 1, fecha_vencimiento: "2025-01-01" },
      }),
    );
    expect(res.status).toBe(202);
    expect(enqueueWhatsAppMock).not.toHaveBeenCalled();
  });

  it("idempotencia /cases: segunda llamada con mismo case_code devuelve 200 y no duplica", async () => {
    const payload = {
      rut: "44444444-4",
      nombre: "Idem",
      email: "idem@x.cl",
      telefono: "+56900000222",
      password_plain: "Algo1234",
      case_code: "AT-IDEM-001",
      service_category: "LABORAL",
      payment_link: "https://pagacuotas.cl/c/idem",
      source: "NEXIO",
    };

    const first = await casesPOST(authedPost(CASES_URL, payload));
    expect(first.status).toBe(201);

    const second = await casesPOST(authedPost(CASES_URL, payload));
    expect(second.status).toBe(200);

    const cases = await _prisma.case.findMany({ where: { code: "AT-IDEM-001" } });
    expect(cases).toHaveLength(1);
    const users = await _prisma.user.count({ where: { rut: "44444444-4" } });
    expect(users).toBe(1);
  });
});
