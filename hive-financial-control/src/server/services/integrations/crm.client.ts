export class CrmClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = process.env.CRM_BASE_URL ?? "";
    this.apiKey = process.env.CRM_INTERNAL_API_KEY ?? "";
  }

  get configured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async notifyPaymentConfirmed(
    crmLeadId: number,
    contratoId: number,
    correlationId?: string | null,
  ) {
    if (!this.configured) return;
    await this.post({
      event: "payment_confirmed",
      crmLeadId,
      contratoId,
      correlation_id: correlationId ?? undefined,
    });
  }

  async notifyServiceStarted(
    crmLeadId: number,
    contratoId: number,
    correlationId?: string | null,
  ) {
    if (!this.configured) return;
    await this.post({
      event: "service_started",
      crmLeadId,
      contratoId,
      correlation_id: correlationId ?? undefined,
    });
  }

  private async post(payload: Record<string, unknown>) {
    const res = await fetch(`${this.baseUrl}/api/webhooks/legal_finance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-lf-callback-secret": this.apiKey,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`CRM webhook ${res.status}: ${text}`);
    }
  }
}
