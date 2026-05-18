"use server";

import { prisma } from "@/lib/prisma";
import { PaymentPortalService } from "@/server/services/integrations/payment-portal.service";

const PAGACUOTAS_PORTAL_URL = process.env.PAGACUOTAS_PORTAL_URL || "http://localhost:3002";
const PAGACUOTAS_API_URL = process.env.PAGACUOTAS_API_URL || "http://localhost:4000";
const PAGACUOTAS_CRM_API_KEY = process.env.PAGACUOTAS_CRM_API_KEY || "";

async function getPagaCuotasAutoLoginUrl(input: {
  rut: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
}) {
  if (!PAGACUOTAS_CRM_API_KEY) return null;

  const response = await fetch(`${PAGACUOTAS_API_URL.replace(/\/$/, "")}/api/integration/clients/from-crm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-crm-api-key": PAGACUOTAS_CRM_API_KEY,
    },
    body: JSON.stringify({
      rut: input.rut,
      nombre: input.nombre,
      telefono: input.telefono,
      email: input.email,
      fuente: "hive_financial_control",
    }),
    cache: "no-store",
  });

  if (!response.ok) return null;
  const data = await response.json();
  return typeof data.autoLoginUrl === "string" ? data.autoLoginUrl : null;
}

export async function registrarPagoAction(contratoId: number): Promise<{
  portal_url: string;
  rut: string;
  email: string | null;
  telefono: string | null;
  nombre: string;
  password: string;
  whatsapp_url: string | null;
  message: string;
}> {
  const contrato = await prisma.contrato.findUnique({
    where: { id: contratoId },
    select: {
      id: true,
      tipo_servicio: true,
      cliente: {
        select: { id: true, rut: true, nombre: true, email: true, telefono: true },
      },
    },
  });

  if (!contrato) throw new Error("Contrato no encontrado.");

  const { rut, nombre, email, telefono } = contrato.cliente;
  const credentials = await new PaymentPortalService().ensurePortalCredentials(contrato.cliente.id);
  const portal_url =
    (await getPagaCuotasAutoLoginUrl({ rut, nombre, telefono, email })) ??
    `${PAGACUOTAS_PORTAL_URL}/client/login?identifier=${encodeURIComponent(rut)}`;
  const message = [
    `Hola ${nombre},`,
    `puedes revisar y pagar tus cuotas en PagaCuotas: ${portal_url}`,
    `RUT: ${rut}`,
    `Clave temporal: ${credentials.password}`,
    "Al ingresar podras cambiar tu clave.",
  ].join("\n");
  const whatsapp_url = telefono
    ? `https://wa.me/${telefono.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`
    : null;

  return { portal_url, rut, email, telefono, nombre, password: credentials.password, whatsapp_url, message };
}
