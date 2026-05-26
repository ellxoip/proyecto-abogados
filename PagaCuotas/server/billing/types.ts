export type BillingEnvironment = 'sandbox' | 'production';
export type BillingProviderName = 'authcl' | 'simulator';
export type BillingDocumentType = 'boleta' | 'boleta_exenta' | 'factura' | 'factura_exenta' | 'nota_credito';
export type BillingDocumentStatus = 'pending' | 'submitted' | 'accepted' | 'rejected' | 'cancelled' | 'failed';

export interface BillingLineItem {
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface BillingIssueRequest {
  external_reference: string;
  document_type: BillingDocumentType;
  sii_type: string;
  recipient: {
    rut: string;
    name: string;
    email?: string;
  };
  amounts: {
    net: number;
    tax: number;
    total: number;
  };
  items: BillingLineItem[];
  metadata?: Record<string, any>;
}

export interface BillingIssueResponse {
  external_billing_id: string;
  folio?: string;
  track_id?: string;
  status: BillingDocumentStatus;
  pdf_url?: string;
  xml_url?: string;
  issued_at?: string;
  accepted_at?: string;
  raw_response: Record<string, any>;
}

export interface BillingStatusResponse {
  external_billing_id: string;
  status: BillingDocumentStatus;
  folio?: string;
  track_id?: string;
  pdf_url?: string;
  xml_url?: string;
  accepted_at?: string;
  error_message?: string;
  raw_response: Record<string, any>;
}

export interface BillingCancelRequest {
  external_billing_id: string;
  reason: string;
}

export interface BillingCancelResponse {
  success: boolean;
  status: BillingDocumentStatus;
  raw_response: Record<string, any>;
}

export interface IBillingProvider {
  readonly name: BillingProviderName;
  readonly environment: BillingEnvironment;
  issueDocument(request: BillingIssueRequest): Promise<BillingIssueResponse>;
  getDocumentStatus(externalBillingId: string): Promise<BillingStatusResponse>;
  cancelDocument(request: BillingCancelRequest): Promise<BillingCancelResponse>;
  validateWebhookSignature(headers: Record<string, string>, body: unknown): boolean;
  healthCheck(): Promise<{ healthy: boolean; message: string }>;
}
