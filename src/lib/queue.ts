import { Queue } from "bullmq";
import { connection } from "./redis";

export const healthSweepQueue = new Queue("health-sweep", { connection });
export const whatsappQueue = new Queue("whatsapp-queue", { connection });
export const emailQueue = new Queue("email-queue", { connection });
export const executionerQueue = new Queue("executioner-queue", { connection });

/**
 * Schedules the recurring health sweep job.
 * Runs every 15 minutes to check overdue cases.
 */
export async function setupHealthSweepCron() {
  await healthSweepQueue.add(
    "sweep",
    {},
    {
      repeat: {
        pattern: "*/15 * * * *",
      },
      jobId: "health-sweep-cron",
    }
  );
}

/**
 * Schedules "The 24h Executioner".
 * Runs every hour to find OPEN cases older than 24h without payment.
 */
export async function setupExecutionerCron() {
  await executionerQueue.add(
    "execute-stale-cases",
    {},
    {
      repeat: {
        pattern: "0 * * * *",
      },
      jobId: "executioner-cron",
    }
  );
}
