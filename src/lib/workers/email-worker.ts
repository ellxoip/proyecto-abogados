import { Worker } from "bullmq";
import { connection } from "../redis";
import type { EmailJob } from "../notifications";
import { processEmailJob } from "../processing/dispatch";

const worker = new Worker<EmailJob>(
  "email-queue",
  async (job) => {
    await processEmailJob(job.data);
  },
  { connection },
);

worker.on("failed", (job, err) => {
  console.error(`[email-worker] Job ${job?.id} failed:`, err.message);
});

export { worker as emailWorker };
