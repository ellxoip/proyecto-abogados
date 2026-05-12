import * as dotenv from "dotenv";
dotenv.config();

import { Redis } from "ioredis";
import express from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

const ENGINE_PROCESSES = [
  {
    id: "health-sweep",
    label: "Control de salud de casos",
    purpose: "Revisa casos abiertos, en proceso o esperando cuotas y aplica reglas de mora/estado.",
    schedule: "Cada 15 minutos",
  },
  {
    id: "executioner",
    label: "Bloqueo por pago inicial pendiente",
    purpose: "Mueve casos OPEN sin pago confirmado por mas de 24 horas a WAITING_CUOTAS.",
    schedule: "Cada hora",
  },
  {
    id: "whatsapp",
    label: "Envio WhatsApp",
    purpose: "Procesa avisos al cliente por actualizaciones, mora, comprobantes y cierre.",
    schedule: "Bajo demanda",
  },
  {
    id: "email",
    label: "Envio Email",
    purpose: "Procesa correos al cliente por actualizaciones, mora, comprobantes y cierre.",
    schedule: "Bajo demanda",
  },
] as const;

async function pingRedis() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const probe = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  probe.on("error", () => {
    /* The catch below prints the formatted error. */
  });

  try {
    await probe.connect();
    const pong = await probe.ping();
    if (pong !== "PONG") throw new Error(`unexpected reply: ${pong}`);
    console.log(`[engine] Redis OK (${url})`);
  } catch (err: any) {
    console.error("\n[engine] No se pudo conectar a Redis.");
    console.error(`        URL probada: ${url}`);
    console.error(`        Error: ${err?.message ?? err}`);
    console.error(
      "\n  Soluciones rapidas:\n" +
        "    1) Crear un Redis gratuito en https://upstash.com -> copiar la URL rediss:// y\n" +
        "       guardarla como REDIS_URL en .env.\n" +
        "    2) Instalar Memurai (Redis para Windows) desde https://www.memurai.com.\n" +
        "    3) Levantar Redis con Docker: docker run -d -p 6379:6379 redis:7-alpine.\n",
    );
    process.exit(1);
  } finally {
    probe.disconnect();
  }
}

async function main() {
  console.log("[engine] Iniciando motor de procesamiento AT INFORMA.");
  for (const processInfo of ENGINE_PROCESSES) {
    console.log(`[engine] ${processInfo.label}: ${processInfo.purpose} (${processInfo.schedule})`);
  }

  await pingRedis();

  const {
    healthSweepQueue,
    whatsappQueue,
    emailQueue,
    executionerQueue,
    setupHealthSweepCron,
    setupExecutionerCron,
  } = await import("./lib/queue");

  await import("./lib/workers/health-sweep");
  await import("./lib/workers/whatsapp-worker");
  await import("./lib/workers/email-worker");
  await import("./lib/workers/executioner");
  console.log("[engine] Consumidores cargados: health-sweep, executioner, whatsapp, email.");

  await setupHealthSweepCron();
  console.log("[engine] Cron activo: control de salud cada 15 minutos.");

  await setupExecutionerCron();
  console.log("[engine] Cron activo: bloqueo por pago inicial pendiente cada hora.");

  if (process.env.WORKER_UI === "1") {
    const app = express();
    const allowedOrigin = process.env.APP_URL ?? "http://localhost:3000";

    app.use((_, res, next) => {
      res.removeHeader("X-Frame-Options");
      res.setHeader("Content-Security-Policy", `frame-ancestors 'self' ${allowedOrigin}`);
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      next();
    });

    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath("/admin/queues");

    createBullBoard({
      queues: [
        new BullMQAdapter(healthSweepQueue),
        new BullMQAdapter(whatsappQueue),
        new BullMQAdapter(emailQueue),
        new BullMQAdapter(executionerQueue),
      ],
      serverAdapter,
      options: {
        uiConfig: {
          boardTitle: "Motor de Procesamiento AT INFORMA",
          locale: { lng: "es" },
          miscLinks: [{ text: "Volver al Sistema", url: `${allowedOrigin}/admin/monitoreo` }],
        },
      },
    });

    app.use("/admin/queues", serverAdapter.getRouter());
    app.get("/health", (_req, res) => {
      res.json({
        ok: true,
        name: "AT INFORMA Processing Engine",
        ts: new Date().toISOString(),
        processes: ENGINE_PROCESSES,
      });
    });

    const PORT = Number(process.env.WORKER_PORT ?? 3001);
    app.listen(PORT, () => {
      console.log(`[engine] Panel BullMQ listo en http://localhost:${PORT}/admin/queues`);
      console.log(`[engine] Monitor permitido desde ${allowedOrigin}`);
    });
  }

  console.log("[engine] Motor listo. Escuchando colas y cron jobs.");
}

main().catch((err) => {
  console.error("[engine] Error fatal:", err);
  process.exit(1);
});
