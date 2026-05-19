/**
 * Resolver del enlace de PagaCuotas para mostrar en el portal del cliente.
 *
 * Modelo: hive-financial-control es la ÚNICA fuente de verdad. Cuando
 * genera el enlace de PagaCuotas, lo pushea a service-control vía
 * /api/internal/integration/clients/payment-link y nosotros lo persistimos
 * en `User.paymentLink`. Acá solo lo leemos.
 *
 * No creamos enlaces desde acá: hacerlo causaba race conditions y enlaces
 * duplicados (uno de financial, otro generado por el fallback). Si el
 * cliente entra al portal antes que financial-control haya pusheado el
 * link, el botón "Pagar" simplemente no aparece todavía.
 */

type PaymentLinkClient = {
  paymentLink: string | null;
};

export async function ensurePagaCuotasPaymentLink(client: PaymentLinkClient): Promise<string | null> {
  return client.paymentLink ?? null;
}
