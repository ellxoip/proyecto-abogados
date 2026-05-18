import type {
  BillingCancelRequest,
  BillingCancelResponse,
  BillingIssueRequest,
  BillingIssueResponse,
  BillingStatusResponse,
  BillingEnvironment,
  BillingProviderName,
  IBillingProvider,
} from '../types.js';

export class BillingSimulatorProvider implements IBillingProvider {
  readonly name: BillingProviderName = 'simulator';
  readonly environment: BillingEnvironment = 'sandbox';

  async issueDocument(request: BillingIssueRequest): Promise<BillingIssueResponse> {
    const id = `bill_sim_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    return {
      external_billing_id: id,
      folio: String(Math.floor(100000 + Math.random() * 900000)),
      track_id: `track_${id}`,
      status: 'accepted',
      pdf_url: `/api/admin/billing-documents/${id}/pdf-placeholder`,
      xml_url: `/api/admin/billing-documents/${id}/xml-placeholder`,
      issued_at: new Date().toISOString(),
      accepted_at: new Date().toISOString(),
      raw_response: { sandbox: true, request },
    };
  }

  async getDocumentStatus(externalBillingId: string): Promise<BillingStatusResponse> {
    return {
      external_billing_id: externalBillingId,
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      raw_response: { sandbox: true },
    };
  }

  async cancelDocument(request: BillingCancelRequest): Promise<BillingCancelResponse> {
    return { success: true, status: 'cancelled', raw_response: { sandbox: true, request } };
  }

  validateWebhookSignature(_headers: Record<string, string>, _body: unknown): boolean {
    return true;
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    return { healthy: true, message: 'Billing simulator healthy' };
  }
}
