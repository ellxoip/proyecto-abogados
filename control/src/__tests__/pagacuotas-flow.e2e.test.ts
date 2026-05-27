import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { POST as paymentLinkPOST } from "@/app/api/internal/integration/clients/payment-link/route";
import { POST as casesPOST } from "@/app/api/internal/integration/cases/route";
import { ensurePagaCuotasPaymentLink } from "@/lib/pagacuotas";
import { _prisma } from "@/lib/db/_client";

const PAYMENT_LINK_URL = "http://test/api/internal/integration/clients/payment-link";
const CASES_URL = "http://test/api/internal/integration/cases";

function authedPost(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "test-internal-key",
    },
    body: JSON.stringify(body),
  });
}

// Mock auth() para simular login del cliente al final del flujo.
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
}));
const { changeOwnPassword } = await import("@/app/portal/cambiar-password/actions");

describe("E2E PagaCuotas — punta a punta", () => {
  it("flujo feliz: financial → service-control → login → rotación", async () => {
    // ── 1. hive-financial-control genera link + password y la pushea al
    //       endpoint payment-link de service-control. Esto crea el ghost
    //       user con las credenciales hasheadas.
    const Y732HX = "Y732HX";
    const PAY_LINK_V1 = "https://pagacuotas.cl/c/abc123";
    const resLink = await paymentLinkPOST(
      authedPost(PAYMENT_LINK_URL, {
        rut: "21.331.955-8",
        nombre: "Matias Villalobos",
        email: "matias.villalobos@hashtagcl.com",
        telefono: "+56986173914",
        payment_link: PAY_LINK_V1,
        password_plain: Y732HX,
        crm_lead_id: 42,
        correlation_id: "corr-pagolink",
      }),
    );
    expect(resLink.status).toBe(200);

    let user = await _prisma.user.findFirst({ where: { rut: "21331955-8" } });
    expect(user).not.toBeNull();
    // Cliente ya conoce su clave desde PagaCuotas; no se fuerza rotación.
    expect(user!.mustChangePassword).toBe(false);
    expect(user!.paymentLink).toBe(PAY_LINK_V1);
    expect(await bcrypt.compare(Y732HX, user!.passwordHash)).toBe(true);

    // ── 2. Antes del pago: pagacuotas helper devuelve el mismo link
    //       que financial-control pusheó (sin POST fallback).
    const linkInPortal = await ensurePagaCuotasPaymentLink(user!);
    expect(linkInPortal).toBe(PAY_LINK_V1);

    // ── 3. Cliente paga en PagaCuotas con Y732HX → financial-control
    //       confirma vía /cases. Mismo password_plain.
    const resCase = await casesPOST(
      authedPost(CASES_URL, {
        rut: "21.331.955-8",
        nombre: "Matias Villalobos",
        email: "matias.villalobos@hashtagcl.com",
        telefono: "+56986173914",
        password_plain: Y732HX,
        case_code: "AT-2025-001",
        service_category: "DEUDA_EJECUTIVA",
        crm_lead_id: 42,
        correlation_id: "corr-pagolink",
        initial_payment_amount: 250000,
        contrato_id_sis_contable: 7001,
        payment_link: PAY_LINK_V1,
        source: "NEXIO",
        financials: { honorarios: 1500000, cuota_inicial: 250000, num_cuotas: 5, monto_cuota: 250000 },
        team: { vendedor: "Marcela" },
        work_order: {
          id: 99,
          type: "DEMANDA_INICIAL",
          created_at: "2025-05-10T12:00:00Z",
          document_url: "https://nexio.cl/docs/ot-99.pdf",
        },
      }),
    );
    expect(resCase.status).toBe(201);

    // Caso creado y marcado como pagado.
    const kase = await _prisma.case.findUnique({ where: { code: "AT-2025-001" } });
    expect(kase).not.toBeNull();
    expect(kase!.is_paid).toBe(true);
    expect(kase!.stage).toBe("OPEN");
    expect(kase!.client_id).toBe(user!.id);

    // OT adjunta como Update.
    const updates = await _prisma.update.findMany({ where: { caseId: kase!.id } });
    expect(updates).toHaveLength(1);
    expect(updates[0].document_url).toBe("https://nexio.cl/docs/ot-99.pdf");

    // Hash sigue siendo válido para Y732HX (sync no rompió nada).
    user = await _prisma.user.findFirst({ where: { rut: "21331955-8" } });
    expect(user!.mustChangePassword).toBe(false);
    expect(await bcrypt.compare(Y732HX, user!.passwordHash)).toBe(true);

    // ── 4. Cliente abre /login con Y732HX → simulamos la verificación
    //       que hace NextAuth.authorize: bcrypt.compare contra el hash.
    const loginOk = await bcrypt.compare(Y732HX, user!.passwordHash);
    expect(loginOk).toBe(true);

    // ── 5. Cliente rota su clave en /portal/cambiar-password.
    authMock.mockResolvedValue({ user: { id: user!.id, role: "CLIENTE" } });
    const rotateRes = await changeOwnPassword({
      currentPassword: Y732HX,
      newPassword: "MiClaveSegura1",
      confirmPassword: "MiClaveSegura1",
    });
    expect(rotateRes).toEqual({ ok: true });

    user = await _prisma.user.findFirst({ where: { rut: "21331955-8" } });
    expect(user!.mustChangePassword).toBe(false);
    expect(await bcrypt.compare("MiClaveSegura1", user!.passwordHash)).toBe(true);
    expect(await bcrypt.compare(Y732HX, user!.passwordHash)).toBe(false);

    const auditChange = await _prisma.auditLog.findFirst({
      where: { action: "PASSWORD_CHANGED", actorId: user!.id },
    });
    expect(auditChange).not.toBeNull();

    // ── 6. Reintento idempotente de financial-control (financial NO
    //       conoce la rotación del cliente). El hash NO debe tocarse.
    const hashBefore = user!.passwordHash;
    const linkV2 = "https://pagacuotas.cl/c/regen-xyz";
    await paymentLinkPOST(
      authedPost(PAYMENT_LINK_URL, {
        rut: "21.331.955-8",
        nombre: "Matias Villalobos",
        email: "matias.villalobos@hashtagcl.com",
        telefono: "+56986173914",
        payment_link: linkV2,
        password_plain: "OTRACLAVE9",
        crm_lead_id: 42,
        correlation_id: "corr-retry",
      }),
    );
    const after = await _prisma.user.findFirst({ where: { rut: "21331955-8" } });
    expect(after!.passwordHash).toBe(hashBefore);
    expect(after!.mustChangePassword).toBe(false);
    // El paymentLink sí se actualiza (no es credencial).
    expect(after!.paymentLink).toBe(linkV2);
    // La nueva clave del cliente sigue siendo la única que abre la cuenta.
    expect(await bcrypt.compare("MiClaveSegura1", after!.passwordHash)).toBe(true);
    expect(await bcrypt.compare("OTRACLAVE9", after!.passwordHash)).toBe(false);
  });

  it("escenario alternativo: financial llama /cases directo sin pasar por /payment-link previo", async () => {
    // Algunas integraciones podrían omitir el push del link y solo enviar
    // el evento de pago confirmado. Service-control debe crear el cliente
    // de cero, incluyendo paymentLink. mustChangePassword se queda en false
    // porque la clave ya la conoce el cliente desde PagaCuotas.
    const Y732HX = "Z9X8K2";
    const PAY_LINK = "https://pagacuotas.cl/c/directo";

    const res = await casesPOST(
      authedPost(CASES_URL, {
        rut: "12.345.678-9",
        nombre: "Cliente Directo",
        email: "directo@cliente.cl",
        telefono: "+56911112222",
        password_plain: Y732HX,
        case_code: "AT-2025-DIRECTO",
        service_category: "CIVIL",
        payment_link: PAY_LINK,
        source: "NEXIO",
      }),
    );
    expect(res.status).toBe(201);

    const user = await _prisma.user.findFirst({ where: { rut: "12345678-9" } });
    expect(user).not.toBeNull();
    expect(user!.mustChangePassword).toBe(false);
    expect(user!.paymentLink).toBe(PAY_LINK);
    expect(await bcrypt.compare(Y732HX, user!.passwordHash)).toBe(true);

    const linkInPortal = await ensurePagaCuotasPaymentLink(user!);
    expect(linkInPortal).toBe(PAY_LINK);
  });

  it("usuario sin paymentLink: portal NO genera ni postea a pagacuotas", async () => {
    const user = await _prisma.user.create({
      data: {
        fullName: "Sin Link",
        email: "sinlink@test.cl",
        phone: "+56900000000",
        role: "CLIENTE",
        passwordHash: await bcrypt.hash("Algo1234", 12),
        rut: "99999999-9",
        active: true,
        mustChangePassword: false,
      },
    });

    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response("nope", { status: 500 });
    }) as typeof fetch;

    try {
      const link = await ensurePagaCuotasPaymentLink(user);
      expect(link).toBeNull();
      expect(fetchCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
