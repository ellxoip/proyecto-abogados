# PagaCuotas: pagos y facturacion SII

## Estado operativo

PagaCuotas queda preparado para operar en dos modos:

- `sandbox`: prueba local funcional sin depender de credenciales reales.
- `production`: mismas rutas y servicios, cambiando solo variables de entorno y credenciales reales.

Flujo activo:

1. Cliente abre link seguro.
2. Cliente elige pasarela.
3. PagaCuotas crea intento de pago.
4. Proveedor confirma pago.
5. PagaCuotas registra `Payment`.
6. PagaCuotas emite DTE asincrono.
7. DTE guarda folio, track id, PDF/XML y estado SII.
8. Portal cliente muestra documentos emitidos.

Regla critica: el pago confirmado no depende del SII en linea. Si DTE falla, pago queda confirmado y DTE queda reintentable.

## Pasarelas disponibles

| Proveedor | Uso | Sandbox |
| --- | --- | --- |
| Transbank Webpay Plus | Principal Chile | Si |
| Flow | Respaldo PyME / transferencias | Si |
| MercadoPago | Respaldo existente | Si |
| Simulator | QA interno | Si |

## DTE disponible

| Documento | SII | Uso |
| --- | --- | --- |
| Boleta electronica | 39 | Cliente persona |
| Boleta exenta | 41 | Servicio exento persona |
| Factura electronica | 33 | Cliente empresa |
| Factura exenta | 34 | Servicio exento empresa |
| Nota de credito | 61 | Correccion/anulacion |

## Regla automatica actual

```env
BILLING_DEFAULT_DOCUMENT_TYPE=boleta
BILLING_INVOICE_FOR_COMPANY=true
```

Con esto:

- Cliente persona emite boleta tipo `39`.
- Cliente con `rut_empresa` o `empresa` en perfil CRM emite factura tipo `33`.
- Si contador exige otro criterio, cambiar `BILLING_DEFAULT_DOCUMENT_TYPE`.

## Variables sandbox funcional

```env
PORT=4000
DATABASE_URL="file:./prisma/dev.db"
APP_URL=http://localhost:4000
VITE_API_BASE_URL=http://localhost:4000
CLIENT_PORTAL_BASE_URL=http://localhost:3000

PAYMENT_ENVIRONMENT=sandbox
PAYMENT_DEFAULT_PROVIDER=transbank

MERCADOPAGO_ENABLED=true
MERCADOPAGO_ACCESS_TOKEN=TEST-sandbox-token
MERCADOPAGO_PUBLIC_KEY=TEST-sandbox-public-key
MERCADOPAGO_WEBHOOK_SECRET=local_webhook_secret

TRANSBANK_ENABLED=true
TRANSBANK_ENVIRONMENT=sandbox
TRANSBANK_COMMERCE_CODE=597055555532
TRANSBANK_API_KEY=change_me_transbank_api_key

FLOW_ENABLED=true
FLOW_API_KEY=change_me_flow_api_key
FLOW_SECRET_KEY=change_me_flow_secret_key

BILLING_ENABLED=true
BILLING_PROVIDER=authcl
BILLING_ENVIRONMENT=sandbox
BILLING_AUTO_ISSUE_ON_PAYMENT=true
BILLING_DEFAULT_DOCUMENT_TYPE=boleta
BILLING_INVOICE_FOR_COMPANY=true
AUTHCL_API_BASE_URL=https://api.auth.cl
AUTHCL_API_KEY=sandbox_authcl_test_key
AUTHCL_WEBHOOK_SECRET=sandbox_authcl_webhook_secret
AUTHCL_COMPANY_RUT=11111111-1
```

Notas sandbox:

- Transbank usa simulacion local si las credenciales son placeholder.
- Flow usa simulacion local si las credenciales son placeholder.
- Auth.cl usa DTE sandbox local si `AUTHCL_API_KEY` empieza con `sandbox_`.
- No se llama a SII real.
- No se emite documento tributario real.

## Levantar local

```powershell
npm install
npx prisma generate
npx prisma db push
npm run server
npm run dev
```

URLs:

- Front cliente/admin: `http://localhost:3000`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/api/health`

Health esperado:

- `providers.transbank.healthy=true`
- `providers.flow.healthy=true`
- `billing.enabled=true`
- `billing.health.authcl.healthy=true`

## Prueba end to end

1. Abrir link de cliente.
2. Seleccionar `Webpay Plus`.
3. Confirmar pago.
4. Callback registra pago.
5. Revisar admin pagos.
6. Revisar documentos DTE.

Resultado esperado en DB:

- `Payment.status=confirmado`
- `Payment.billing_status=accepted`
- `BillingDocument.document_type=boleta` o `factura`
- `BillingDocument.sii_type=39` o `33`
- `BillingDocument.folio` con valor
- `BillingDocument.pdf_url` con valor

## Paso a produccion

Cambiar variables:

```env
PAYMENT_ENVIRONMENT=production
PAYMENT_DEFAULT_PROVIDER=transbank

TRANSBANK_ENABLED=true
TRANSBANK_ENVIRONMENT=production
TRANSBANK_COMMERCE_CODE=real_commerce_code
TRANSBANK_API_KEY=real_api_key

FLOW_ENABLED=true
FLOW_API_KEY=real_flow_api_key
FLOW_SECRET_KEY=real_flow_secret_key

BILLING_ENABLED=true
BILLING_PROVIDER=authcl
BILLING_ENVIRONMENT=production
BILLING_AUTO_ISSUE_ON_PAYMENT=true
BILLING_DEFAULT_DOCUMENT_TYPE=boleta
BILLING_INVOICE_FOR_COMPANY=true
AUTHCL_API_BASE_URL=https://api.auth.cl
AUTHCL_API_KEY=real_authcl_api_key
AUTHCL_WEBHOOK_SECRET=real_authcl_webhook_secret
AUTHCL_COMPANY_RUT=real_company_rut
```

Validar antes:

- Certificado digital configurado en proveedor DTE.
- CAF disponible para boletas/facturas.
- Giro, direccion, comuna y ciudad correctos.
- RUT emisor correcto.
- Webhook Auth.cl apuntando a `/api/webhooks/billing-provider/authcl`.
- Webhook Transbank/Flow apuntando a `/api/webhooks/payment-provider/:provider`.
- HTTPS activo.
- Backups DB activos.
- Logs sin secretos.

## Rollback rapido

Desactivar DTE sin tocar pagos:

```env
BILLING_ENABLED=false
```

Cambiar pasarela principal:

```env
PAYMENT_DEFAULT_PROVIDER=mercadopago
```

Desactivar Flow:

```env
FLOW_ENABLED=false
```

Desactivar Transbank:

```env
TRANSBANK_ENABLED=false
```

## Endpoints utiles

- `GET /api/health`
- `GET /api/admin/providers`
- `GET /api/admin/billing-providers`
- `GET /api/admin/billing-documents`
- `POST /api/admin/payments/:id/bill`
- `POST /api/admin/billing-documents/:id/retry`
- `POST /api/webhooks/billing-provider/authcl`

## Criterios produccion OK

- Pago confirmado genera un solo DTE.
- DTE rechazado no duplica pago.
- Reintento manual funciona.
- PDF/XML visible en portal.
- Folio visible en admin.
- CRM recibe pago confirmado.
- SIS.CONTABLE recibe pago antes de DTE.
- Webhooks idempotentes.
- Secretos fuera de logs.

