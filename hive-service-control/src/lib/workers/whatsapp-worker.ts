import { Worker } from "bullmq";
import { connection } from "../redis";
import type { WhatsAppJob } from "../notifications";
import { processWhatsAppJob } from "../processing/dispatch";

const worker = new Worker<WhatsAppJob>(
  "whatsapp-queue",
  async (job) => {
    await processWhatsAppJob(job.data);
  },
  { connection },
);

worker.on("failed", (job, err) => {
  console.error(`[whatsapp-worker] Job ${job?.id} failed:`, err.message);
});

export { worker as whatsappWorker };
