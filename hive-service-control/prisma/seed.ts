import { PrismaClient } from "@prisma/client";
import { Role, CaseStage } from "../src/lib/db-enums";

import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = (pw: string) => bcrypt.hash(pw, 10);

  // ── SuperAdmin ──
  const jorge = await prisma.user.upsert({
    where: { email: "jorge@atinforma.cl" },
    update: {},
    create: {
      role: Role.SUPER_ADMIN,
      fullName: "Jorge Morales (SuperAdmin)",
      email: "jorge@atinforma.cl",
      phone: "+56911111111",
      passwordHash: await hash("Admin2026!"),
    },
  });

  // ── Sistema de Cuotas ──
  await prisma.user.upsert({
    where: { email: "cuotas@atinforma.cl" },
    update: {},
    create: {
      role: Role.SISTEMA_CUOTAS,
      fullName: "Sistema de Cuotas",
      email: "cuotas@atinforma.cl",
      phone: "+56900000000",
      passwordHash: await hash("System2026!"),
      managedById: jorge.id,
    },
  });

  // ── Jefe de Grupo ──
  const jefe = await prisma.user.upsert({
    where: { email: "jefe@atinforma.cl" },
    update: {},
    create: {
      role: Role.JEFE_DE_MESA,
      fullName: "Ricardo Fuentes (Jefe de Grupo)",
      email: "jefe@atinforma.cl",
      phone: "+56922222222",
      passwordHash: await hash("Jefe2026!"),
      managedById: jorge.id,
    },
  });

  // ── Abogado ──
  const abogado = await prisma.user.upsert({
    where: { email: "abogado@atinforma.cl" },
    update: {},
    create: {
      role: Role.ABOGADO,
      fullName: "María López (Abogada)",
      email: "abogado@atinforma.cl",
      phone: "+56933333333",
      passwordHash: await hash("Abogado2026!"),
      managedById: jefe.id,
    },
  });

  // ── Cliente ──
  const cliente = await prisma.user.upsert({
    where: { email: "cliente@gmail.com" },
    update: {
      rut: "12345678-9",
    },
    create: {
      role: Role.CLIENTE,
      fullName: "Pedro González (Cliente)",
      email: "cliente@gmail.com",
      phone: "+56944444444",
      rut: "12345678-9",
      passwordHash: await hash("Cliente2026!"),
    },
  });

  // ── Categories ──
  const tributario = await prisma.category.upsert({
    where: { name: "TRIBUTARIO" },
    update: {},
    create: { name: "TRIBUTARIO" },
  });

  const laboral = await prisma.category.upsert({
    where: { name: "LABORAL" },
    update: {},
    create: { name: "LABORAL" },
  });

  // ── Demo Case ──
  await prisma.case.upsert({
    where: { code: "AT-2026-001" },
    update: {},
    create: {
      code: "AT-2026-001",
      client_id: cliente.id,
      jefe_mesa_id: jefe.id,
      abogados: { connect: [{ id: abogado.id }] },
      stage: CaseStage.IN_PROGRESS,
      is_paid: true,
      categoryId: tributario.id,
    },
  });

  await prisma.case.upsert({
    where: { code: "AT-2026-002" },
    update: {},
    create: {
      code: "AT-2026-002",
      client_id: cliente.id,
      stage: CaseStage.OPEN,
      is_paid: false,
      categoryId: laboral.id,
    },
  });


  console.log("✅ Seed complete. Users created:");
  console.log("  SuperAdmin:    jorge@atinforma.cl     / Admin2026!");
  console.log("  Jefe de Grupo:  jefe@atinforma.cl      / Jefe2026!");
  console.log("  Abogado:       abogado@atinforma.cl   / Abogado2026!");
  console.log("  Cliente:       cliente@gmail.com      / Cliente2026!");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

