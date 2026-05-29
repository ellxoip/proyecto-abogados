# Configuracion de cobros reales

Esta guia deja PagaCuotas listo para pruebas reales con MercadoPago. No compartas estas credenciales por chat ni las subas a Git.

## 1. URL publica

Para cobros reales `APP_URL` debe ser HTTPS y alcanzable desde internet.

Ejemplo:

```env
APP_URL=https://pagacuotas.tudominio.cl
VITE_API_BASE_URL=https://pagacuotas.tudominio.cl
```

Para una prueba puntual se puede usar un tunel HTTPS estable, pero en produccion usa dominio propio.

```env
PAYMENT_ENVIRONMENT=production
PAYMENT_DEFAULT_PROVIDER=mercadopago
```

## 2. MercadoPago

En MercadoPago Developers crea/configura la aplicacion productiva y obtiene:

- Access token productivo.
- Public key productiva.
- Secret de webhook.

Configura:

```env
MERCADOPAGO_ENABLED=true
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_PUBLIC_KEY=APP_USR-...
MERCADOPAGO_WEBHOOK_SECRET=secret_del_panel
```

Registra este webhook en MercadoPago:

```text
https://pagacuotas.tudominio.cl/api/webhooks/payment-provider/mercadopago
```

Activa eventos de pagos. PagaCuotas valida `x-signature` y `x-request-id` antes de procesar.

## 3. SIS.CONTABLE

PagaCuotas debe apuntar a la API real de sistema contable:

```env
SIS_CONTABLE_BASE_URL=https://sis-contable.tudominio.cl
SIS_CONTABLE_AUTH_METHOD=api_key
SIS_CONTABLE_API_KEY=misma_clave_configurada_en_sis_contable
SIS_CONTABLE_LOCAL_FIXTURES=false
```

El sistema contable debe aceptar `x-api-key`.

## 4. Validacion antes de cobrar

Ejecuta:

```bash
npm run config:production:check
npm run lint
npm run build
```

Si el primer comando falla, no intentes cobros reales.

## 5. Prueba real controlada

1. Usa un cliente real con una cuota real de bajo monto en SIS.CONTABLE.
2. Entra al portal cliente.
3. Selecciona la cuota.
4. Paga con MercadoPago.
5. Revisa:
   - `PaymentAttempt` en estado `confirmado`.
   - `Payment` creado.
   - `sis_contable_sync_status=sync`.
   - Cuota actualizada en SIS.CONTABLE.
   - Webhook MercadoPago con firma valida.

No uses datos de tarjeta en PagaCuotas. Los datos sensibles se ingresan solo en la pagina del proveedor.
