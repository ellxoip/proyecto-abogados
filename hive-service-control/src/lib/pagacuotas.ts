import { withSystemRls } from "@/lib/rls";

const PAGACUOTAS_API_URL = process.env.PAGACUOTAS_API_URL || "http://localhost:4000";
const PAGACUOTAS_CRM_API_KEY = process.env.PAGACUOTAS_CRM_API_KEY || "";

type PaymentLinkClient = {
  id: string;
  rut: string | null;
  fullName: string;
  phone: string;
  email: string;
  paymentLink: string | null;
};

export async function ensurePagaCuotasPaymentLink(client: PaymentLinkClient) {
  if (client.paymentLink) return client.paymentLink;
  if (!client.rut || !PAGACUOTAS_CRM_API_KEY) return null;

  const response = await fetch(`${PAGACUOTAS_API_URL.replace(/\/$/, "")}/api/integration/clients/from-crm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-crm-api-key": PAGACUOTAS_CRM_API_KEY,
    },
    body: JSON.stringify({
      rut: client.rut,
      nombre: client.fullName,
      telefono: client.phone,
      email: client.email,
      fuente: "hive_service_control",
    }),
    cache: "no-store",
  });

  if (!response.ok) return null;

  const data = await response.json();
  const autoLoginUrl = typeof data.autoLoginUrl === "string" ? data.autoLoginUrl : null;
  if (!autoLoginUrl) return null;

  await withSystemRls((tx) =>
    tx.user.update({
      where: { id: client.id },
      data: { paymentLink: autoLoginUrl },
    }),
  );

  return autoLoginUrl;
}
