"use server";

import { prisma } from "@/lib/prisma";
import { PaymentPortalService } from "@/server/services/integrations/payment-portal.service";
import { AtInformaClient } from "@/server/services/integrations/at-informa.client";
import { normalizePagaCuotasPortalLink } from "@/server/services/integrations/pagacuotas-links";

const PAGACUOTAS_PORTAL_URL = (process.env.PAGACUOTAS_PORTAL_URL || "http://localhost:3002").replace(/\/+$/, "");
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

export async function generarAccesoPagaCuotasAction(contratoId: number): Promise<{
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
  const passwordLabel = credentials.password ?? "Usa tu clave vigente";
  const autoLoginUrl = await getPagaCuotasAutoLoginUrl({ rut, nombre, telefono, email });
  const portal_url =
    normalizePagaCuotasPortalLink(autoLoginUrl) ??
    `${PAGACUOTAS_PORTAL_URL}/client/login?identifier=${encodeURIComponent(rut)}`;

  // Push paymentLink + password a service-control para que el botón
  // "Pagar cuotas pendientes" del portal cliente apunte al autoLoginUrl
  // recién generado. Sin esto SC.User.paymentLink queda con un link viejo
  // o vacío.
  try {
    await new AtInformaClient().syncPaymentLink({
      rut,
      nombre,
      email,
      telefono,
      payment_link: portal_url,
      password_plain: credentials.password,
      crm_lead_id: null,
      correlation_id: null,
    });
  } catch (err) {
    console.error("[generarAccesoPagaCuotasAction] syncPaymentLink a SC falló:", err);
  }
  const message = [
    `Hola ${nombre},`,
    `puedes entrar a tu Portal PagaCuotas para revisar tu caso y pagar tus cuotas: ${portal_url}`,
    `RUT: ${rut}`,
    `Clave: ${passwordLabel}`,
    "Al ingresar podras cambiar tu clave.",
  ].join("\n");
  const whatsapp_url = telefono
    ? `https://wa.me/${telefono.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`
    : null;

  return { portal_url, rut, email, telefono, nombre, password: passwordLabel, whatsapp_url, message };
}
