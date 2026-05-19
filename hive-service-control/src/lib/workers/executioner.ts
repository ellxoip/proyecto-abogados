import { Worker } from "bullmq";
import { connection } from "../redis";
import { runExecutioner } from "../processing/run";

const worker = new Worker(
  "executioner-queue",
  async (job) => {
    if (job.name !== "execute-stale-cases") return;

    const result = await runExecutioner();
    if (result.processed > 0) {
      console.log(`[executioner] Halted ${result.processed} stale OPEN case(s) -> WAITING_CUOTAS.`);
    }
    return result;
  },
  { connection },
);

worker.on("failed", (job, err) => {
  console.error(`[executioner-worker] Job ${job?.id} failed:`, err.message);
});

export { worker as executionerWorker };
