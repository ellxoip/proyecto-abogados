type BuildAtInformaPayloadInput = {
  monto: number;
  paidAt: Date;
  referencia: string;
  paymentEventId?: string;
  casoExternalId?: string;
  numeroCuota?: number;
};

export function buildAtInformaPaymentPayload(
  input: BuildAtInformaPayloadInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    monto: input.monto,
    fecha_pago: input.paidAt.toISOString().slice(0, 10),
    referencia: input.referencia,
  };

  if (input.paymentEventId) {
    payload.payment_event_id = input.paymentEventId;
    return payload;
  }

  if (!input.casoExternalId || !input.numeroCuota) {
    throw new Error(
      "Sin payment_event_id se requiere casoExternalId y numeroCuota para AT-INFORMA.",
    );
  }

  payload.caso_id = input.casoExternalId;
  payload.numero_cuota = input.numeroCuota;
  return payload;
}
