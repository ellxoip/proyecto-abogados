import { Job, Worker } from "bullmq";
import { connection } from "../redis";
import { runHealthSweep } from "../processing/run";

export const healthSweepWorker = new Worker(
  "health-sweep",
  async (job: Job) => {
    console.log(`[health-sweep] Job ${job.id} started.`);
    const result = await runHealthSweep();
    console.log(`[health-sweep] Job ${job.id} completed. Processed ${result.processed} cases.`);
    return result;
  },
  { connection },
);

healthSweepWorker.on("failed", (job, err) => {
  console.error(`[health-sweep] Job ${job?.id} failed with error:`, err.message);
});
