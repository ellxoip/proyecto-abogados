/**
 * Legal OS v3.0 - Seed de Casos de Prueba
 *
 * Crea usuarios y casos de prueba para escenarios de flujo normal,
 * mora, cuotas y asignación.
 *
 * Uso: npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-test-cases.ts
 */

import { PrismaClient, Role, CaseStage, PaymentStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = "Test2026!";

const CATEGORY_NAMES = [
  "TRIBUTARIO",
  "LABORAL",
  "CIVIL",
  "PENAL",
  "FAMILIA",
  "MIGRATORIO",
];

async function main() {
  const hash = (pw: string) => bcrypt.hash(pw, 10);
  const passwordHash = await hash(PASSWORD);

  console.log("🚀 Iniciando seed de casos de prueba...\n");

  // ── Categorías (tabla dinámica) ──
  const catId = new Map<string, string>();
  for (const name of CATEGORY_NAMES) {
    const c = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    catId.set(name, c.id);
  }
  console.log(`✅ Categorías garantizadas: ${CATEGORY_NAMES.join(", ")}`);

  // ── Clientes ──
  const clienteNormal = await prisma.user.upsert({
    where: { email: "carlos.perez@test.cl" },
    update: {},
    create: { role: Role.CLIENTE, fullName: "Carlos Pérez Normal", email: "carlos.perez@test.cl", phone: "+56910000001", passwordHash },
  });
  const clienteMora = await prisma.user.upsert({
    where: { email: "juan.perez@test.cl" },
    update: {},
    create: { role: Role.CLIENTE, fullName: "Juan Pérez Mora", email: "juan.perez@test.cl", phone: "+56910000002", passwordHash },
  });
  const clienteCuotas = await prisma.user.upsert({
    where: { email: "ana.lopez@test.cl" },
    update: {},
    create: { role: Role.CLIENTE, fullName: "Ana López Cuotas", email: "ana.lopez@test.cl", phone: "+56910000003", passwordHash },
  });
  const clienteNuevo = await prisma.user.upsert({
    where: { email: "pedro.nuevo@test.cl" },
    update: {},
    create: { role: Role.CLIENTE, fullName: "Pedro Nuevo Cliente", email: "pedro.nuevo@test.cl", phone: "+56910000004", passwordHash },
  });
  const clienteMultiple = await prisma.user.upsert({
    where: { email: "maria.multiple@test.cl" },
    update: {},
    create: { role: Role.CLIENTE, fullName: "María Multiple Casos", email: "maria.multiple@test.cl", phone: "+56910000005", passwordHash },
  });
  console.log("✅ 5 clientes upserted");

  // ── Abogados de prueba ──
  const jefeMesa = await prisma.user.findFirst({ where: { role: Role.JEFE_DE_MESA } });

  const abogado1 = await prisma.user.upsert({
    where: { email: "abogado1@test.cl" },
    update: {},
    create: { role: Role.ABOGADO, fullName: "Dr. Roberto Díaz (Abogado 1)", email: "abogado1@test.cl", phone: "+56920000001", passwordHash, managedById: jefeMesa?.id },
  });
  const abogado2 = await prisma.user.upsert({
    where: { email: "abogado2@test.cl" },
    update: {},
    create: { role: Role.ABOGADO, fullName: "Dra. Carmen Soto (Abogado 2)", email: "abogado2@test.cl", phone: "+56920000002", passwordHash, managedById: jefeMesa?.id },
  });
  console.log("✅ 2 abogados upserted");

  // ── Helper para upsert de caso ──
  type CaseOpts = {
    code: string;
    clientId: string;
    stage: CaseStage;
    is_paid: boolean;
    categoryName: string;
    abogadoId?: string | null;
    haltedReason?: string | null;
  };

  const upsertCase = async (o: CaseOpts) => {
    const baseData = {
      code: o.code,
      client_id: o.clientId,
      stage: o.stage,
      is_paid: o.is_paid,
      categoryId: catId.get(o.categoryName)!,
      jefe_mesa_id: o.abogadoId ? jefeMesa?.id ?? null : null,
      halted_at: o.stage === CaseStage.HALTED_BY_PAYMENT || o.stage === CaseStage.WAITING_CUOTAS ? new Date() : null,
      halted_reason: o.haltedReason ?? null,
    };
    const create = o.abogadoId
      ? { ...baseData, abogados: { connect: [{ id: o.abogadoId }] } }
      : baseData;
    const update = o.abogadoId
      ? { ...baseData, abogados: { set: [{ id: o.abogadoId }] } }
      : { ...baseData, abogados: { set: [] } };
    return prisma.case.upsert({ where: { code: o.code }, create, update });
  };

  // 7.1 Flujo normal — Carlos Pérez
  await upsertCase({ code: "AT-TEST-001", clientId: clienteNormal.id, stage: CaseStage.IN_PROGRESS, is_paid: true,  categoryName: "TRIBUTARIO", abogadoId: abogado1.id });
  await upsertCase({ code: "AT-TEST-004", clientId: clienteNormal.id, stage: CaseStage.OPEN,         is_paid: true,  categoryName: "PENAL" });
  await upsertCase({ code: "AT-TEST-005", clientId: clienteNormal.id, stage: CaseStage.FINISHED,     is_paid: true,  categoryName: "CIVIL", abogadoId: abogado1.id });

  // 7.2 Mora — Juan Pérez
  await upsertCase({ code: "AT-TEST-002", clientId: clienteMora.id, stage: CaseStage.HALTED_BY_PAYMENT, is_paid: false, categoryName: "LABORAL", abogadoId: abogado1.id, haltedReason: "Prueba de mora — caso de test" });
  await upsertCase({ code: "AT-TEST-006", clientId: clienteMora.id, stage: CaseStage.IN_PROGRESS,        is_paid: false, categoryName: "FAMILIA", abogadoId: abogado2.id });

  // 7.3 Cuotas — Ana López
  await upsertCase({ code: "AT-TEST-003", clientId: clienteCuotas.id, stage: CaseStage.WAITING_CUOTAS, is_paid: true, categoryName: "CIVIL", haltedReason: "Esperando validación de Sistema de Cuotas" });
  await upsertCase({ code: "AT-TEST-007", clientId: clienteCuotas.id, stage: CaseStage.OPEN,            is_paid: true, categoryName: "MIGRATORIO" });

  // 7.4 Asignación — Pedro Nuevo
  await upsertCase({ code: "AT-TEST-008", clientId: clienteNuevo.id, stage: CaseStage.OPEN,         is_paid: true, categoryName: "TRIBUTARIO" });
  await upsertCase({ code: "AT-TEST-009", clientId: clienteNuevo.id, stage: CaseStage.IN_PROGRESS, is_paid: true, categoryName: "LABORAL", abogadoId: abogado1.id });

  // Múltiples — María Multiple
  await upsertCase({ code: "AT-TEST-101", clientId: clienteMultiple.id, stage: CaseStage.IN_PROGRESS, is_paid: true,  categoryName: "TRIBUTARIO", abogadoId: abogado1.id });
  await upsertCase({ code: "AT-TEST-102", clientId: clienteMultiple.id, stage: CaseStage.IN_PROGRESS, is_paid: true,  categoryName: "PENAL",      abogadoId: abogado2.id });
  await upsertCase({ code: "AT-TEST-103", clientId: clienteMultiple.id, stage: CaseStage.OPEN,         is_paid: false, categoryName: "LABORAL" });

  console.log("✅ 12 casos upserted");

  // ── Payment events ──
  const casoMora = await prisma.case.findUnique({ where: { code: "AT-TEST-002" } });
  if (casoMora) {
    const exists = await prisma.paymentEvent.findFirst({ where: { caseId: casoMora.id, status: PaymentStatus.OVERDUE } });
    if (!exists) {
      await prisma.paymentEvent.create({
        data: { caseId: casoMora.id, status: PaymentStatus.OVERDUE, amount: 50000 },
      });
      console.log("✅ PaymentEvent OVERDUE → AT-TEST-002");
    }
  }
  const casoSinPagar = await prisma.case.findUnique({ where: { code: "AT-TEST-006" } });
  if (casoSinPagar) {
    const exists = await prisma.paymentEvent.findFirst({ where: { caseId: casoSinPagar.id, status: PaymentStatus.UNPAID } });
    if (!exists) {
      await prisma.paymentEvent.create({
        data: { caseId: casoSinPagar.id, status: PaymentStatus.UNPAID, amount: 75000 },
      });
      console.log("✅ PaymentEvent UNPAID → AT-TEST-006");
    }
  }

  // ── Resumen ──
  const counts = await prisma.case.groupBy({
    by: ["stage"],
    where: { code: { startsWith: "AT-TEST-" } },
    _count: true,
  });
  console.log("\n────── RESUMEN ──────");
  for (const r of counts) console.log(`  ${r.stage.padEnd(20)} ${r._count}`);
  console.log(`\n🔑 Password (todos los users de prueba): ${PASSWORD}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ Error en seed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
