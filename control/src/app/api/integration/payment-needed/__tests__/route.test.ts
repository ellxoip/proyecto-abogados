import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { POST } from "@/app/api/integration/payment-needed/route";
import { _prisma } from "@/lib/db/_client";

const URL = "http://test/api/integration/payment-needed";

function authed(body: unknown, secret = "test-ingest-secret") {
  return new Request(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-integration-secret": secret,
    },
    body: JSON.stringify(body),
  });
}

async function seedSuperAdmin(suffix: string) {
  const passwordHash = await bcrypt.hash("AdminPass1", 12);
  return _prisma.user.create({
    data: {
      fullName: `Admin ${suffix}`,
      email: `admin-${suffix}@test.cl`,
      phone: "+56900000099",
      role: "SUPER_ADMIN",
      passwordHash,
      mustChangePassword: false,
    },
  });
}

describe("POST /api/integration/payment-needed", () => {
  it("401 sin secret", async () => {
    const res = await POST(
      new Request(URL, { method: "POST", body: JSON.stringify({}) }),
    );
    expect(res.status).toBe(401);
  });

  it("401 con secret incorrecto", async () => {
    const res = await POST(authed({}, "wrong"));
    expect(res.status).toBe(401);
  });

  it("422 con payload inválido", async () => {
    const res = await POST(authed({ crmLeadId: "not-a-number" }));
    expect(res.status).toBe(422);
  });

  it("happy path: crea notificación para cada SUPER_ADMIN activo", async () => {
    const a1 = await seedSuperAdmin("1");
    const a2 = await seedSuperAdmin("2");
    await seedSuperAdmin("3");
    // Admin inactivo no debe recibir notificación.
    const inactive = await seedSuperAdmin("inactive");
    await _prisma.user.update({ where: { id: inactive.id }, data: { active: false } });

    const res = await POST(authed({
      crmLeadId: 42,
      fullName: "Matias Villalobos",
      honorarios: 1500000,
      invoiceUrl: "https://nexio.cl/comprobantes/42.pdf",
    }));
    expect(res.status).toBe(200);

    const notifs = await _prisma.notification.findMany();
    expect(notifs).toHaveLength(3);
    const ids = notifs.map((n) => n.userId).sort();
    expect(ids).toContain(a1.id);
    expect(ids).toContain(a2.id);
    expect(ids).not.toContain(inactive.id);

    const sample = notifs[0];
    expect(sample.title).toContain("Pago comprometido");
    expect(sample.body).toContain("Matias Villalobos");
    expect(sample.body).toContain("$1.500.000");
    expect(sample.body).toContain("Comprobante adjunto");
  });

  it("happy path sin SUPER_ADMIN: 200 sin crear notificaciones", async () => {
    const res = await POST(authed({
      crmLeadId: 42,
      fullName: "Solo",
    }));
    expect(res.status).toBe(200);
    const notifs = await _prisma.notification.findMany();
    expect(notifs).toHaveLength(0);
  });

  it("vincula leadId cuando el lead ya existe por externalId", async () => {
    const a1 = await seedSuperAdmin("1");
    const abo = await _prisma.user.create({
      data: {
        fullName: "Abo",
        email: "abo-pn@test.cl",
        phone: "+56900000077",
        role: "ABOGADO",
        passwordHash: await bcrypt.hash("Pwd1234", 12),
        mustChangePassword: false,
      },
    });
    const lead = await _prisma.lead.create({
      data: {
        fullName: "Lead Matias",
        phone: "+56900000033",
        assignedAbogadoId: abo.id,
        meetingAt: new Date(),
        externalId: "42",
      },
    });

    await POST(authed({
      crmLeadId: 42,
      fullName: "Matias",
    }));

    const notif = await _prisma.notification.findFirst({ where: { userId: a1.id } });
    expect(notif!.leadId).toBe(lead.id);
  });
});
