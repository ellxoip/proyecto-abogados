import { NextResponse } from "next/server";
import { runHealthSweep } from "@/lib/processing/run";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const userAgent = req.headers.get("user-agent") ?? "";
  const secret = process.env.CRON_SECRET;
  const isVercelCron = process.env.VERCEL === "1" && userAgent.includes("vercel-cron");

  if (secret && auth !== `Bearer ${secret}` && !isVercelCron) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const result = await runHealthSweep();
  return NextResponse.json({ ok: true, process: "health-sweep", result });
}
