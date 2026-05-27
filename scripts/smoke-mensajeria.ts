/**
 * Smoke test end-to-end del flujo de mensajería en producción.
 *
 * Crea (o reusa) un caso de prueba con un cliente con teléfono y email
 * controlados por flags, escribe un Comment PUBLIC y dispara el dispatch
 * REAL (WhatsApp + Email) al destinatario.
 *
 * Uso:
 *   cd hive-service-control
 *   npx tsx scripts/smoke-mensajeria.ts --to-phone=+56912345678 --to-email=jorge@example.cl
 *
 * Flags:
 *   --to-phone=<E.164>   teléfono destino del WhatsApp (requerido)
 *   --to-email=<email>   email destino (requerido)
 *   --dry-run            crea el Comment pero NO dispara dispatch
 *   --cleanup            tras el envío borra el Comment + Case + Client (limpio)
 *
 * Requisitos previos:
 *   1. META_WHATSAPP_TOKEN y META_WHATSAPP_PHONE_ID configurados
 *   2. RESEND_API_KEY configurada y dominio verificado
 *   3. Plantilla WhatsApp "public_comment" aprobada en Meta Business
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

(function loadEnv() {
  const file = path.resolve(__dirname, "..", ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
})();

function parseArgs() {
  const out: Record<string, string | boolean> = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)(=(.+))?$/);
    if (m) out[m[1]] = m[3] ?? true;
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const phone = typeof args["to-phone"] === "string" ? args["to-phone"] : null;
  const email = typeof args["to-email"] === "string" ? args["to-email"] : null;
  const dryRun = args["dry-run"] === true;
  const cleanup = args["cleanup"] === true;

  if (!phone || !email) {
    console.error("✗ Faltan flags --to-phone y --to-email.");
    process.exit(1);
  }

  const { _prisma } = await import("@/lib/db/_client");
  const { processWhatsAppJob, processEmailJob } = await import("@/lib/processing/dispatch");

  const suffix = Date.now().toString(36);
  console.log("Smoke test mensajería — service-control");
  console.log(`  destino phone : ${phone}`);
  console.log(`  destino email : ${email}`);
  console.log(`  dry-run       : ${dryRun}`);
  console.log("");

  // 1. Seed mínimo: cliente + abogado + caso.
  const cliente = await _prisma.user.create({
    data: {
      fullName: "Smoke Cliente",
      email,
      phone,
      role: "CLIENTE",
      passwordHash: "x",
      active: true,
      mustChangePassword: true,
    },
  });
  const abogado = await _prisma.user.create({
    data: {
      fullName: "Smoke Abogado",
      email: `smoke-abo-${suffix}@test.cl`,
      phone: "+56900000000",
      role: "ABOGADO",
      passwordHash: "x",
      active: true,
    },
  });
  const cat = await _prisma.category.upsert({
    where: { name: "CIVIL" },
    update: {},
    create: { name: "CIVIL" },
  });
  const kase = await _prisma.case.create({
    data: {
      code: `AT-SMOKE-${suffix}`,
      client_id: cliente.id,
      categoryId: cat.id,
      stage: "OPEN",
      is_paid: true,
      abogados: { connect: { id: abogado.id } },
    },
  });
  console.log(`  ✓ Caso ${kase.code} creado`);

  // 2. Comment PUBLIC.
  const comment = await _prisma.comment.create({
    data: {
      caseId: kase.id,
      authorId: abogado.id,
      body: `Smoke test ${new Date().toISOString()} — verificando WhatsApp+Email.`,
      type: "PUBLIC",
    },
  });
  console.log(`  ✓ Comment PUBLIC #${comment.id} creado`);

  if (dryRun) {
    console.log("");
    console.log("dry-run: dispatch NO disparado.");
  } else {
    // 3. Dispatch real.
    try {
      await processWhatsAppJob({
        kind: "public_comment",
        caseId: kase.id,
        commentId: comment.id,
      });
      console.log("  ✓ WhatsApp dispatch ejecutado (revisa los logs/inbox)");
    } catch (e) {
      console.error("  ✗ WhatsApp falló:", e instanceof Error ? e.message : e);
    }
    try {
      await processEmailJob({
        kind: "public_comment",
        caseId: kase.id,
        commentId: comment.id,
      });
      console.log("  ✓ Email dispatch ejecutado");
    } catch (e) {
      console.error("  ✗ Email falló:", e instanceof Error ? e.message : e);
    }
  }

  if (cleanup) {
    await _prisma.auditLog.deleteMany({ where: { caseId: kase.id } });
    await _prisma.comment.deleteMany({ where: { caseId: kase.id } });
    await _prisma.case.delete({ where: { id: kase.id } });
    await _prisma.user.delete({ where: { id: abogado.id } });
    await _prisma.user.delete({ where: { id: cliente.id } });
    console.log("");
    console.log("  ✓ cleanup OK");
  } else {
    console.log("");
    console.log(`  Para limpiar: re-ejecutar con --cleanup (caso ${kase.code} queda en DB)`);
  }

  await _prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗ Smoke test falló:", e);
  process.exit(1);
});
