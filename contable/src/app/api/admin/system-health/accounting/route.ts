import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { AccountingHealthService } from "@/server/services/configuracion/accounting-health.service";

export async function GET() {
  const { error } = await checkMutationRole();
  if (error) return error;

  const svc = new AccountingHealthService(prisma);
  const report = await svc.runChecks();

  const httpStatus = report.status === "OK" ? 200 : report.status === "WARNING" ? 200 : 422;
  return NextResponse.json(report, { status: httpStatus });
}
