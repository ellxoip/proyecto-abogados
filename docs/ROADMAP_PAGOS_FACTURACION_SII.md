# Roadmap pagos y facturacion SII

## Decision recomendada

Para PagaCuotas conviene separar dos dominios:

- Pagos: `Transbank Webpay Plus` como proveedor principal en Chile, `MercadoPago` como respaldo ya existente, `Flow` como opcion simple para PyME o botones/transferencias.
- DTE SII: `Auth.cl API DTE` como integracion inicial API-first, con adaptador intercambiable para `webFactura` o `SimpleFactura`.

Motivo: el sistema ya tiene una capa de proveedores de pago (`server/providers`) y una capa de integracion contable (`server/clients/sisContable.client.ts`). La mejora debe entrar como modulos aislados, no mezclada dentro del flujo actual de cuotas.

## Ranking DTE

### 1. Auth.cl API DTE

Mejor punto de partida si prioridad es velocidad tecnica:

- API REST JSON.
- Sandbox.
- Webhooks de estado SII.
- DTE tipo 33, 34, 39, 41, 52, 56, 61.
- Firma digital y envio SII gestionado.
- SDKs Node/Python/PHP.

Riesgo: validar contrato, SLA, custodia certificado `.p12`, soporte y politicas de CAF antes de productivo.

### 2. webFactura API

Mejor alternativa si prioridad es volumen y operacion:

- API REST.
- OAuth 2.0.
- Swagger/Postman.
- Caso publico de alto volumen.
- Emision unitaria y masiva.

Riesgo: revisar acceso a documentacion, costos, ambientes y tiempos de soporte.

### 3. SimpleFactura

Buena alternativa si prioridad es soporte comercial local:

- Portal + API.
- Operacion DTE completa.
- Buena opcion si negocio quiere respaldo humano y menos desarrollo.

Riesgo: confirmar endpoints, webhooks, sandbox real e idempotencia.

### 4. BaseAPI Chile

Usar solo si se necesita operar directo con Portal MiPyme/SII o consultar datos SII extra:

- Muy util para SII en JSON.
- Puede requerir credenciales SII del contribuyente.

Riesgo: mayor responsabilidad operativa y tributaria para PagaCuotas.

## Flujo objetivo

1. Cliente paga cuota.
2. Proveedor confirma pago por webhook.
3. PagaCuotas crea `Payment`.
4. PagaCuotas sincroniza SIS.CONTABLE.
5. PagaCuotas solicita DTE al proveedor SII.
6. Proveedor responde `track_id` / `folio` / `pdf_url`.
7. Webhook DTE actualiza estado SII.
8. PagaCuotas expone boleta/factura en portal.
9. CRM recibe evento final: pago + documento tributario.

Regla clave: pago confirmado no debe depender de SII en linea. Facturacion debe ser asincrona con reintentos.

## Modelo de datos propuesto

Agregar tabla `BillingDocument`:

- `id`
- `external_billing_id`
- `payment_id`
- `provider`
- `document_type` (`boleta`, `boleta_exenta`, `factura`, `factura_exenta`, `nota_credito`)
- `sii_type` (`33`, `34`, `39`, `41`, `61`)
- `folio`
- `track_id`
- `status` (`pending`, `submitted`, `accepted`, `rejected`, `cancelled`, `failed`)
- `recipient_rut`
- `recipient_name`
- `recipient_email`
- `net_amount`
- `tax_amount`
- `total_amount`
- `pdf_url`
- `xml_url`
- `request_payload_json`
- `response_payload_json`
- `provider_payload_json`
- `error_message`
- `retry_count`
- `issued_at`
- `accepted_at`
- `created_at`
- `updated_at`

Agregar campos en `Payment`:

- `billing_status`
- `billing_document_id`

## Abstraccion tecnica

Crear:

- `server/billing/types.ts`
- `server/billing/providers/authcl.provider.ts`
- `server/billing/providers/webfactura.provider.ts` futuro
- `server/billing/providers/simplefactura.provider.ts` futuro
- `server/billing/index.ts`
- `server/services/billing.service.ts`
- `server/controllers/billing.controller.ts`

Interfaz base:

```ts
export interface IBillingProvider {
  readonly name: BillingProviderName;
  readonly environment: BillingEnvironment;
  issueDocument(request: BillingIssueRequest): Promise<BillingIssueResponse>;
  getDocumentStatus(externalBillingId: string): Promise<BillingStatusResponse>;
  cancelDocument(request: BillingCancelRequest): Promise<BillingCancelResponse>;
  validateWebhookSignature(headers: Record<string, string>, body: unknown): boolean;
  healthCheck(): Promise<{ healthy: boolean; message: string }>;
}
```

## Reglas tributarias iniciales

Validar con contador antes de productivo:

- B2C: boleta electronica tipo `39`.
- B2B con RUT empresa: factura electronica tipo `33`.
- Servicios exentos: tipo `41` o `34`.
- Anulacion o correccion: nota de credito tipo `61`.
- Facturar solo pagos confirmados.
- No emitir dos DTE por mismo pago.
- Guardar XML/PDF/folio/track_id.
- Nunca bloquear confirmacion de pago por rechazo SII.

## Pasarelas de pago

### Fase 1

Mantener `mercadopago` actual. Mejorar:

- webhook idempotente.
- validacion firma estricta.
- conciliacion diaria.
- UI admin para reintentos.

### Fase 2

Agregar `transbank`:

- `server/providers/transbank.provider.ts`
- `ProviderName = 'mercadopago' | 'transbank' | 'flow' | 'simulator'`
- `TRANSBANK_COMMERCE_CODE`
- `TRANSBANK_API_KEY`
- `TRANSBANK_ENVIRONMENT`
- retorno `/api/payments/callback`
- webhook/commit seguro.

### Fase 3

Agregar `flow`:

- `FLOW_API_KEY`
- `FLOW_SECRET_KEY`
- `payment/create`
- `urlConfirmation`
- `payment/getStatus`

## Implementacion por etapas

### Etapa 0: contrato negocio

Definir:

- documentos requeridos: boleta, factura, exenta, nota credito.
- emisor tributario.
- giro, direccion, comuna, ciudad.
- afecto/exento por servicio.
- momento de emision: al pago o consolidado diario.
- correo destino.

### Etapa 1: base interna

Crear modelo `BillingDocument`, servicio, provider simulator y endpoints admin:

- `POST /api/admin/payments/:id/bill`
- `GET /api/admin/billing-documents`
- `POST /api/webhooks/billing-provider/:provider`

Resultado: flujo probado sin proveedor real.

### Etapa 2: Auth.cl sandbox

Implementar adaptador Auth.cl:

- emitir boleta/factura.
- guardar respuesta.
- recibir webhook.
- descargar/guardar PDF/XML URL.
- reintentar rechazados.

Resultado: primer DTE sandbox por pago real/simulado.

### Etapa 3: Transbank

Implementar Webpay Plus manteniendo MercadoPago.

Resultado: selector proveedor en admin y health check.

### Etapa 4: produccion controlada

Activar:

- `BILLING_ENABLED=true`
- `BILLING_PROVIDER=authcl`
- `PAYMENT_DEFAULT_PROVIDER=transbank`
- monitoreo errores.
- reconciliacion diaria pago vs DTE.

Resultado: productivo con rollback rapido.

## Variables de entorno

```env
BILLING_ENABLED=false
BILLING_PROVIDER=authcl
BILLING_ENVIRONMENT=sandbox
BILLING_AUTO_ISSUE_ON_PAYMENT=true
BILLING_DEFAULT_DOCUMENT_TYPE=boleta

AUTHCL_API_BASE_URL=https://api.auth.cl
AUTHCL_API_KEY=
AUTHCL_WEBHOOK_SECRET=
AUTHCL_COMPANY_RUT=

TRANSBANK_ENABLED=false
TRANSBANK_COMMERCE_CODE=
TRANSBANK_API_KEY=

FLOW_ENABLED=false
FLOW_API_KEY=
FLOW_SECRET_KEY=
```

## Criterios de salida

- Pago confirmado genera un solo DTE.
- DTE rechazado no duplica pago.
- Reintento manual y automatico.
- PDF visible en portal cliente.
- CRM recibe folio y URL.
- SIS.CONTABLE recibe estado pago antes de facturacion.
- Logs auditables por pago y DTE.
- Sin secretos en logs.

## Recomendacion final

Orden optimo:

1. Auth.cl DTE sandbox.
2. Billing simulator.
3. Transbank Webpay Plus.
4. Flow opcional.
5. webFactura como fallback enterprise.

No integrar directo SII al inicio. Mucho costo operativo. Usar intermediario y mantener arquitectura intercambiable.
