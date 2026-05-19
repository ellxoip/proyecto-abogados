/**
 * Pago ficticio genérico para validar el flujo de pagos.
 *
 * Simula que PagaCuotas confirmó el pago de una cuota PENDIENTE de cualquier
 * cliente del sistema contable, invocando el endpoint público interno de
 * financial-control:
 *
 *   POST /api/integrations/pagacuotas/payments/confirmed
 *
 * Esto:
 *   1. Crea un Pago en financial-control.
 *   2. Aplica el pago a la cuota correspondiente (estado → PAGADA).
 *   3. Si era la primera cuota y el contrato estaba PENDING_INITIAL_PAYMENT,
 *      lo deja en ACTIVO.
 *
 * Auth: x-internal-api-key = PAGACUOTAS_INTERNAL_API_KEY (se lee desde .env
 * de financial-control automáticamente).
 *
 * Uso:
 *   cd hive-financial-control
 *
 *   # Pagar próxima cuota PENDIENTE del cliente con RUT 15.879.421-3:
 *   npx tsx scripts/pay-demo-carlos.ts --rut 15.879.421-3
 *
 *   # Pagar cuota específica:
 *   npx tsx scripts/pay-demo-carlos.ts --rut 15.879.421-3 --cuota 2
 *
 *   # Pagar usando ID de cliente o contrato:
 *   npx tsx scripts/pay-demo-carlos.ts --cliente 4
 *   npx tsx scripts/pay-demo-carlos.ts --contrato 4 --cuota 3
 *
 *   # Variables de entorno equivalentes:
 *   RUT=15.879.421-3 CUOTA=2 npx tsx scripts/pay-demo-carlos.ts
 *
 * Re-ejecutar sin --cuota paga la siguiente PENDIENTE.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient, EstadoCuota } from "@prisma/client";

const prisma = new PrismaClient();

const FC_URL = process.env.FINANCIAL_CONTROL_URL ?? "http://localhost:3000";

// ── Parser de argumentos: soporta --flag valor y env vars ───────────────
function parseArgs() {
  const out: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = "true";
      }
    }
  }
  return {
    rut: out.rut ?? process.env.RUT ?? null,
    clienteId: out.cliente ?? process.env.CLIENTE_ID ?? null,
    contratoId: out.contrato ?? process.env.CONTRATO_ID ?? null,
    cuota: out.cuota ?? process.env.CUOTA ?? null,
    monto: out.monto ?? process.env.MONTO ?? null,
    reference: out.ref ?? process.env.REF ?? null,
  };
}

function resolveApiKey(): string {
  const fromEnv =
    process.env.PAGACUOTAS_INTERNAL_API_KEY ?? process.env.INTERNAL_API_KEY;
  if (fromEnv) return fromEnv;

  const envFile = path.resolve(__dirname, "..", ".env");
  if (!existsSync(envFile)) {
    throw new Error("No se pudo localizar .env de hive-financial-control.");
  }
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(
      /^(PAGACUOTAS_INTERNAL_API_KEY|INTERNAL_API_KEY)\s*=\s*"?([^"]+)"?$/,
    );
    if (m) return m[2].trim();
  }
  throw new Error(
    "PAGACUOTAS_INTERNAL_API_KEY no encontrada en .env ni en variables de entorno.",
  );
}

async function resolveTarget(args: ReturnType<typeof parseArgs>) {
  // Prioridad: contrato_id explícito → cliente_id → rut.
  let contratoId: number | null = args.contratoId ? Number(args.contratoId) : null;
  let clienteId: number | null = args.clienteId ? Number(args.clienteId) : null;

  if (!contratoId && !clienteId && !args.rut) {
    throw new Error(
      "Se requiere uno de: --rut <RUT>, --cliente <id>, o --contrato <id>.",
    );
  }

  if (!contratoId && !clienteId && args.rut) {
    const cliente = await prisma.cliente.findUnique({
      where: { rut: args.rut },
    });
    if (!cliente) throw new Error(`Cliente con RUT ${args.rut} no encontrado.`);
    clienteId = cliente.id;
  }

  if (!contratoId && clienteId) {
    const contrato = await prisma.contrato.findFirst({
      where: { cliente_id: clienteId },
      orderBy: { created_at: "desc" },
    });
    if (!contrato) {
      throw new Error(`Cliente #${clienteId} no tiene contratos.`);
    }
    contratoId = contrato.id;
  }

  if (!contratoId) {
    throw new Error("No se pudo resolver el contrato a pagar.");
  }

  const contrato = await prisma.contrato.findUnique({
    where: { id: contratoId },
    include: { cliente: true },
  });
  if (!contrato) throw new Error(`Contrato #${contratoId} no existe.`);

  // Cuota: específica o próxima PENDIENTE
  let cuota;
  if (args.cuota) {
    const numero = Number(args.cuota);
    cuota = await prisma.cuota.findFirst({
      where: { contrato_id: contrato.id, numero_cuota: numero },
    });
    if (!cuota) {
      throw new Error(`Cuota #${numero} no existe en contrato #${contrato.id}.`);
    }
    if (cuota.estado === EstadoCuota.PAGADA) {
      throw new Error(`Cuota #${numero} ya está PAGADA.`);
    }
  } else {
    cuota = await prisma.cuota.findFirst({
      where: {
        contrato_id: contrato.id,
        estado: { in: [EstadoCuota.PENDIENTE, EstadoCuota.PARCIAL, EstadoCuota.VENCIDA] },
      },
      orderBy: { numero_cuota: "asc" },
    });
    if (!cuota) {
      throw new Error(
        `Contrato #${contrato.id} no tiene cuotas pendientes — ya está al día.`,
      );
    }
  }

  return { cliente: contrato.cliente, contrato, cuota };
}

async function main() {
  const args = parseArgs();
  const apiKey = resolveApiKey();
  const { cliente, contrato, cuota } = await resolveTarget(args);

  const montoArg = args.monto ? Number(args.monto) : null;
  const monto =
    montoArg && montoArg > 0 ? montoArg : Number(cuota.saldo_pendiente);

  const externalPaymentId = `pagacuotas-demo-${Date.now()}-${cuota.id}`;
  const paidAt = new Date().toISOString();
  const reference =
    args.reference ?? `PAGO-DEMO-${cliente.rut}-C${cuota.numero_cuota}`;

  console.log("Pago ficticio — payments/confirmed");
  console.log(`  Cliente:  #${cliente.id} ${cliente.nombre} (${cliente.rut})`);
  console.log(`  Contrato: #${contrato.id} ${contrato.tipo_servicio}`);
  console.log(`  Cuota:    #${cuota.numero_cuota} (${cuota.estado})`);
  console.log(`  Monto:    $${monto.toLocaleString("es-CL")}`);
  console.log(`  Endpoint: ${FC_URL}/api/integrations/pagacuotas/payments/confirmed`);
  console.log("");

  const payload = {
    external_payment_id: externalPaymentId,
    identifier: cliente.rut,
    contrato_id: String(contrato.id),
    cuota_ids: [String(cuota.id)],
    amount: monto,
    paid_at: paidAt,
    reference,
    provider: "DEMO_SIMULATOR",
  };

  const res = await fetch(
    `${FC_URL}/api/integrations/pagacuotas/payments/confirmed`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    },
  );

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (res.status !== 200) {
    console.error(`✗ Pago rechazado (HTTP ${res.status}):`, body);
    process.exitCode = 1;
    return;
  }

  console.log("✓ Pago confirmado en financial-control");
  console.log("  Respuesta:", JSON.stringify(body, null, 2));

  // Verificación post-pago: leer DB y mostrar estado.
  const cuotaAfter = await prisma.cuota.findUnique({ where: { id: cuota.id } });
  const pagos = await prisma.pago.findMany({
    where: { contrato_id: contrato.id },
    orderBy: { created_at: "desc" },
    take: 3,
  });

  console.log("");
  console.log(`Cuota #${cuotaAfter?.numero_cuota} ahora:`);
  console.log(`  estado:           ${cuotaAfter?.estado}`);
  console.log(`  monto_pagado:     $${Number(cuotaAfter?.monto_pagado).toLocaleString("es-CL")}`);
  console.log(`  saldo_pendiente:  $${Number(cuotaAfter?.saldo_pendiente).toLocaleString("es-CL")}`);
  console.log("");
  console.log(`Últimos pagos del contrato (${pagos.length}):`);
  for (const p of pagos) {
    console.log(
      `  Pago #${p.id} — $${Number(p.monto_pagado).toLocaleString("es-CL")} — ${p.fecha_pago.toISOString().slice(0, 10)} — ref=${p.referencia ?? "—"}`,
    );
  }
}

main()
  .catch((err) => {
    console.error("✗ Falló el pago demo:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
