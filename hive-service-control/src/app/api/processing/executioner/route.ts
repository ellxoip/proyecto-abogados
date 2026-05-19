import { NextResponse } from "next/server";
import { runExecutioner } from "@/lib/processing/run";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const userAgent = req.headers.get("user-agent") ?? "";
  const secret = process.env.CRON_SECRET;
  const isVercelCron = process.env.VERCEL === "1" && userAgent.includes("vercel-cron");

  if (secret && auth !== `Bearer ${secret}` && !isVercelCron) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const result = await runExecutioner();
  return NextResponse.json({ ok: true, process: "executioner", result });
}
