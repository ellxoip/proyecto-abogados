import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { notFound } from "next/navigation";
import { ConfigClient } from "./ConfigClient";

export default async function ConfigPage() {
  const session = await auth();
  if (!session?.user?.id) return notFound();

  const data = await withRls(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: session.user.id },
      select: { secondary_code: true },
    });

    const logs = await tx.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        action: true,
        status: true,
        channel: true,
        message: true,
        createdAt: true,
      },
    });

    return {
      twoFactorEnabled: Boolean(user?.secondary_code),
      logs: logs.map((log) => ({
        ...log,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  });

  return (
    <ConfigClient
      initialTwoFactorEnabled={data.twoFactorEnabled}
      initialLogs={data.logs}
      whatsappConfigured={Boolean(process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_API_TOKEN)}
    />
  );
}
