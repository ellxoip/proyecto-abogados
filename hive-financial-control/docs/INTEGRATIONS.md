# Integraciones — hive-financial-control

Estado: vigente desde el refactor de ownership de cliente PagaCuotas (mayo 2026).

Este documento describe el flujo end-to-end y las decisiones de ownership entre los
cuatro sistemas del workspace. Si vienes nuevo, lee primero `## Ownership` y luego
`## Flujo principal`.

---

## Ownership

| Sistema | Responsabilidad única |
|---|---|
| **NEXIO** | CRM. Captura leads, agenda reuniones, genera OT, dispara cambios de stage. **NO** persiste cliente financiero ni espejo de PagaCuotas. |
| **hive-financial-control** | Fuente de verdad de cliente financiero, contrato, cuotas, deuda, estado contable del pago. Es quien orquesta el fan-out hacia PagaCuotas y AT.Informa. |
| **PagaCuotas** | Orquestador de cobranza: proveedor de pago (Flow/Webpay/MercadoPago), webhooks, DTE, callbacks. Genera credenciales y portal de cliente. |
| **hive-service-control** | Caso legal post-pago. Solo recibe clientes que ya pagaron. |

Regla: **un evento de negocio = un único dueño**. Si dos sistemas creen ser dueños del mismo evento, hay un bug arquitectónico.

---

## Flujo principal: lead → caso pagado

```
NEXIO (CRM)
  │
  │ 1. Lead capturado, reunión agendada, OT generada
  │
  │ 2. Stage cambia a "pago_comprometido"
  │    POST /api/integrations/crm/pago-comprometido
  ▼
hive-financial-control
  │
  │ 3. handleOpportunityAccepted (CrmIntegrationService)
  │    - findOrCreateCliente (idempotente por RUT)
  │    - createContratoWithCuotas (transacción)
  │    - upsertReference CRM
  │    - scheduleClientCreation → PagaCuotas (side-effect, non-blocking)
  │
  │ 4. POST /api/integration/clients/from-crm
  ▼
PagaCuotas
  │
  │ 5. Persiste cliente, devuelve autoLoginUrl
  │ 6. financial-control genera clave temporal y sincroniza hive-service-control
  │    POST /api/internal/integration/clients/payment-link
  │ 7. financial-control llama callback NEXIO pagacuotas_ready con link + clave temporal
  │
  │ 8. Cliente paga vía proveedor (Flow/Webpay/MP)
  │    Webhook llega a PagaCuotas
  ▼
PagaCuotas
  │
  │ 9. POST /api/integrations/pagacuotas/payments/confirmed
  ▼
hive-financial-control
  │
  │ 10. registerConfirmedPayment (PagaCuotasIntegrationService)
  │    - persiste Pago + AplicacionPago en DB (source of truth)
  │    - si contrato es PENDING_INITIAL_PAYMENT y viene de CRM:
  │      → triggerInitialPaymentActions (async setImmediate)
  ▼
hive-service-control
  │
  │ 11. POST /api/internal/integration/cases
  │    - crea caso legal idempotente por case_code
  │    - reutiliza misma clave temporal + payment_link sincronizados
  │    - notifica CRM payment_confirmed / service_started
```

---

## Endpoints clave

### Entrada (inbound a financial-control)

| Endpoint | Caller | Auth | Propósito |
|---|---|---|---|
| `POST /api/integrations/crm/opportunities/accepted` | NEXIO | CRM API key | Onboarding nuevo lead aceptado |
| `POST /api/integrations/crm/pago-comprometido` | NEXIO | CRM API key | Alias legacy del anterior |
| `POST /api/integrations/pagacuotas/payments/confirmed` | PagaCuotas | Internal API key | Pago confirmado por proveedor |
| `POST /api/integrations/pagacuotas/payments/rejected` | PagaCuotas | Internal API key | Pago rechazado |
| `POST /api/integrations/pagacuotas/payments/reversed` | PagaCuotas | Internal API key | Reversa de pago |
| `POST /api/integrations/pagacuotas/payment-intents/validate` | PagaCuotas | Internal API key | Pre-validación antes de cobro |
| `POST /api/integrations/pagacuotas/payment-attempts` | PagaCuotas | Internal API key | Intento de pago (auditoría) |
| `POST /api/internal/integration/warnings-by-rut` | hive-service-control | `HIVE_SERVICE_INTEGRATION_API_KEY` | Lookup morosidad |
| `POST /api/internal/sync/at-informa` | trigger interno | Internal API key | Sync masivo a AT.Informa |
| `POST /api/internal/pagacuotas/retry-sweep` | Vercel cron / interno | Dual: Internal API key O `CRON_SECRET` | Reintenta clientes pendientes en PagaCuotas |
| `POST /api/cron/cuota-warnings` | Vercel cron | `CRON_SECRET` | Notificaciones diarias de morosidad |

### Salida (outbound desde financial-control)

| Target | Endpoint | Auth | Cuándo |
|---|---|---|---|
| PagaCuotas | `POST {PAGACUOTAS_API_URL}/api/integration/clients/from-crm` | `x-crm-api-key` (`PAGACUOTAS_CRM_API_KEY`) | Fin de `handleOpportunityAccepted` |
| hive-service-control | `POST /api/internal/integration/clients/payment-link` | `INTEGRATION_INTERNAL_API_KEY` | Link + clave temporal PagaCuotas listos |
| AT.Informa | `POST {AT_INFORMA_URL}/...` | API key AT.Informa | Pago confirmado, sync masivo |
| hive-service-control | `POST /api/internal/integration/cases` | `INTEGRATION_INTERNAL_API_KEY` | Pago inicial confirmado en contrato CRM |
| CRM (NEXIO) | callbacks | CRM API key | Resultado payment_confirmed / service_started |

---

## Retry mechanism: cliente PagaCuotas

### Problema que resuelve

PagaCuotas puede estar caído temporalmente cuando financial-control crea el contrato.
Antes: NEXIO empujaba a PagaCuotas, fallaba, creaba un espejo en DB local (doble fuente de verdad). **Eliminado.**

Ahora: financial-control intenta el push UNA vez en `handleOpportunityAccepted`. Si falla,
queda persistido como `IntegrationEvent[event_type="pagacuotas.client.from-crm", status=PENDING]`
y un cron lo reintenta cada 12 minutos hasta 8 intentos.

### Componentes

- **Servicio**: `src/server/services/integrations/pagacuotas-notify.service.ts` (`PagaCuotasNotifyService`).
  - `scheduleClientCreation(payload)` — invocado al final del onboarding. Idempotente por `idempotency_key = "pagacuotas:client:from-crm:contrato={id}"`. Nunca lanza.
  - `retryEvent(eventId)` — invocado por el sweep worker. Incrementa `result_payload.attempts`.
  - `listPending(limit)` — eventos PENDING ordenados por antigüedad.
- **Endpoint sweep**: `POST/GET /api/internal/pagacuotas/retry-sweep`.
  - Auth dual: `assertInternalApiAuth` O `CRON_SECRET` (Bearer / `x-cron-secret`).
  - Body opcional: `{limit?: number (1-100, default 25), dryRun?: boolean}`.
  - Vercel cron lo invoca cada 12 minutos via GET.
- **Modelo persistencia**: `IntegrationEvent` (Prisma). No tabla nueva; reusa schema existente.
- **Result payload en PENDING**: `{ attempts, last_error, last_status, last_retry_at }`.
- **Transición a FAILED**: a los 8 attempts, marca FAILED con `error_message = "Max retries (8) alcanzado. Último error: ..."`. Requiere intervención manual.

### Operativa

- **Inspeccionar pendientes** (psql):
  ```sql
  SELECT id, idempotency_key, status, error_message, result_payload, created_at
  FROM "IntegrationEvent"
  WHERE event_type = 'pagacuotas.client.from-crm'
    AND status IN ('PENDING', 'FAILED')
  ORDER BY created_at DESC LIMIT 50;
  ```
- **Forzar sweep manual**:
  ```bash
  curl -X POST $FINANCIAL_URL/api/internal/pagacuotas/retry-sweep \
    -H "x-api-key: $PAGACUOTAS_INTERNAL_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"limit": 50}'
  ```
- **Dry-run sin tocar PagaCuotas**:
  ```bash
  curl -X POST $FINANCIAL_URL/api/internal/pagacuotas/retry-sweep \
    -H "x-api-key: $PAGACUOTAS_INTERNAL_API_KEY" \
    -d '{"dryRun": true}'
  ```
- **Reintentar un FAILED manualmente**:
  ```sql
  UPDATE "IntegrationEvent"
  SET status = 'PENDING', result_payload = jsonb_set(coalesce(result_payload,'{}'), '{attempts}', '0')
  WHERE id = <event_id>;
  ```
  Luego correr sweep o esperar al próximo cron tick.

---

## Variables de entorno críticas

### hive-financial-control

| Variable | Quién la usa | Notas |
|---|---|---|
| `PAGACUOTAS_API_URL` | `PagaCuotasNotifyService`, `app/cuotas/[contratoId]/actions.ts` | Base URL del server PagaCuotas (default `http://localhost:4000`) |
| `PAGACUOTAS_CRM_API_KEY` | `PagaCuotasNotifyService`, `app/cuotas/[contratoId]/actions.ts` | API key que PagaCuotas valida como `x-crm-api-key` |
| `PAGACUOTAS_INTERNAL_API_KEY` | `assertInternalApiAuth` | Auth de entrada para callers que PagaCuotas use al llamar a financial |
| `PAGACUOTAS_INTERNAL_BEARER_TOKEN` | `assertInternalApiAuth` | Alternativa Bearer del anterior |
| `INTERNAL_API_KEY` / `INTERNAL_BEARER_TOKEN` | `assertInternalApiAuth` (fallback) | Mismo propósito, nombre genérico |
| `HIVE_SERVICE_INTEGRATION_API_KEY` | `warnings-by-rut` | Auth de entrada que hive-service-control usa |
| `CRM_*_API_KEY` | `assertCrmApiAuth` | Auth de entrada que NEXIO usa |
| `CRON_SECRET` | `cron/cuota-warnings`, `internal/pagacuotas/retry-sweep` | Auth Vercel cron + integraciones cron externas |
| `AT_INFORMA_*` | `AtInformaClient`, `AtInformaSyncService` | Auth/URL AT.Informa |
| `DATABASE_URL` / `DIRECT_URL` | Prisma | Supabase Postgres |

### PagaCuotas

| Variable | Notas |
|---|---|
| `SIS_CONTABLE_BASE_URL` | URL de financial-control |
| `SIS_CONTABLE_API_KEY` / `SIS_CONTABLE_BEARER_TOKEN` | Auth para llamar a financial (debe coincidir con `PAGACUOTAS_INTERNAL_*` del lado financial) |
| `SIS_CONTABLE_AUTH_METHOD` | `api_key` o `bearer` |
| `SIS_CONTABLE_LOCAL_FIXTURES` | **Ignorado en producción** (`NODE_ENV=production` o `PAYMENT_ENVIRONMENT=production`). Solo válido en dev. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Login admin panel |
| `ADMIN_TOKEN_SECRET` / `CLIENT_TOKEN_SECRET` | Firma de tokens |

### NEXIO

| Variable | Notas |
|---|---|
| `PAGACUOTAS_URL` | Legacy. NEXIO ya **no** empuja a PagaCuotas en el stage handler. Variable se conserva para el endpoint admin manual `/api/pagacuotas/clientes`. |
| `PAGACUOTAS_API_KEY` | Idem |
| `PAGACUOTAS_PORTAL_URL` | Construcción de links espejo legacy (no usado en flow nuevo) |
| `PAGACUOTAS_ALLOW_LOCAL_FALLBACK` | Default `false`. `true` solo permitido si `ENVIRONMENT != production`. Habilita `_local_fallback` en `utils/pagacuotas.py`. |
| `ENVIRONMENT` | `local` / `staging` / `production`. Gobierna `ALLOW_LOCAL_FALLBACK`. |
| `LEGAL_FINANCE_URL` / `LEGAL_FINANCE_API_KEY` | Auth para llamar a financial-control (sí es activo y crítico) |

---

## Decisiones arquitectónicas (ADR-light)

### ADR-1 — Ownership del push a PagaCuotas

**Fecha**: mayo 2026.

**Contexto**: NEXIO empujaba a PagaCuotas en stage `pago_comprometido` vía `POST /api/integrations/crm/payment-commitments`. Esa ruta no existía en PagaCuotas. Las llamadas fallaban, NEXIO caía a `_local_fallback` que creaba un espejo en DB local de NEXIO. Resultado: dos sistemas creían ser dueños del cliente de cobranza.

**Decisión**: financial-control es el único sistema que empuja a PagaCuotas. NEXIO solo notifica al contable; el contable decide cuándo y cómo crear el cliente en PagaCuotas.

**Consecuencias**:
- El push se hace al final de `CrmIntegrationService.handleOpportunityAccepted`.
- Si falla, queda en `IntegrationEvent` PENDING + retry-sweep cada 12 min.
- NEXIO elimina su push directo (`leads.py` cleanup).
- `_local_fallback` en NEXIO sigue disponible solo opt-in en dev (`ALLOW_LOCAL_FALLBACK=true` con `ENVIRONMENT != production`).
- El campo `lead.pagacuotas_*` en NEXIO se actualiza por callback `pagacuotas_ready` desde financial-control. NEXIO es quien envía el WhatsApp con link y clave temporal.

### ADR-2 — Reutilizar `IntegrationEvent` vs tabla nueva

**Contexto**: El retry-sweep necesita persistir intentos pendientes con attempt count.

**Decisión**: Reusar tabla `IntegrationEvent` existente con `event_type = "pagacuotas.client.from-crm"` y persistir attempts en `result_payload`. No agregar tabla `PendingPagacuotasClient`.

**Consecuencias**:
- Menos schema drift, una sola tabla para outbound events.
- `result_payload` se sobrescribe (no se mantiene historial granular). Aceptable: `last_error` + `last_status` + `last_retry_at` es suficiente para troubleshooting.
- Reusa `IntegrationEventService.ensureIdempotency` ya testeado.

### ADR-3 — Fixtures locales bloqueadas en producción

**Contexto**: `SIS_CONTABLE_LOCAL_FIXTURES=true` permite a PagaCuotas simular respuestas de financial-control para desarrollo. Era posible activarlo accidentalmente en prod y servir datos falsos a clientes reales.

**Decisión**: En `sisContable.client.ts`, el flag se ignora cuando `NODE_ENV === "production"` o `PAYMENT_ENVIRONMENT === "production"`. Log `ERROR` si se intenta.

**Consecuencias**: Aunque alguien deje el flag mal seteado en prod, el cliente HTTP siempre va contra `SIS_CONTABLE_BASE_URL` real.

### ADR-4 — Webhooks Flow/Webpay deshabilitados (503)

**Contexto**: `hive-service-control/src/app/api/webhooks/{flow,webpay}/route.ts` aceptaban POSTs y registraban PaymentEvent con datos mock hardcoded (caseId `AT-MOCK-001`, monto `$150.000`). Cualquier POST externo creaba un pago falso.

**Decisión**: Ambos webhooks devuelven 503 hasta que se implemente la integración real con validación de token contra Flow/Transbank API. Mocks eliminados.

**Consecuencias**: Pagos vía proveedor externo no llegan directamente a `hive-service-control`. El flujo real es: proveedor → PagaCuotas webhook → PagaCuotas notifica a financial-control → financial notifica a service-control.

### ADR-5 — Retry-sweep en financial, no en PagaCuotas

**Contexto**: Una propuesta inicial fue poner el retry-sweep en PagaCuotas (más cerca del consumidor del evento).

**Decisión**: vive en financial-control.

**Razón**: la tabla `IntegrationEvent` con los pendientes vive en financial. Financial tiene el contexto completo (cliente, contrato, OT). PagaCuotas solo necesita un endpoint receptor idempotente, no tiene info para reconstruir el payload.

---

## Cómo se prueba esto

```bash
# Unit tests del side-effect a PagaCuotas
npx vitest run src/server/services/__tests__/pagacuotas-notify.service.test.ts

# Test del hook en CrmIntegrationService
npx vitest run src/server/services/__tests__/crm-integration.service.test.ts

# Test del endpoint retry-sweep (auth + sweep + dryRun + GET)
npx vitest run src/app/api/internal/pagacuotas/retry-sweep/route.test.ts

# Suite completa
npm run test

# Build
npm run build
```

E2E manual:
1. `npm run dev` en financial-control y PagaCuotas (`SIS_CONTABLE_LOCAL_FIXTURES=true` en pagaCuotas dev).
2. Desde NEXIO: cambiar lead a `pago_comprometido`.
3. Esperado: contrato creado en financial, `IntegrationEvent[pagacuotas.client.from-crm]` con status PROCESSED, log de PagaCuotas mostrando creación de cliente.
4. Para forzar pending: detener PagaCuotas server antes del paso 2. El evento queda PENDING; al levantar PagaCuotas, el cron sweep (o `curl` manual) lo procesa.

---

## Pendientes conocidos

- **Callback financial → NEXIO** para actualizar `lead.pagacuotas_*` cuando el push se completa o falla definitivamente. Hoy NEXIO queda con esos campos en blanco tras el cleanup.
- **Endpoint admin POST `/api/pagacuotas/clientes`** en NEXIO (`pagacuotas_router.py:57`) tiene bug pre-existente: llama `crear_cliente` (async) sin `await`. Out of scope del refactor; arreglar al deprecar/migrar el endpoint.
- **Zod schemas en `pagacuotas/*` routes de financial**: `payment-attempts`, `payments/confirmed/rejected/reversed`, `payment-intents/validate` validan en service con `pickString/pickNumber` en vez de zod. Consistencia pendiente con `client-login` que sí usa zod.
- **Worker de retry para AT.Informa**: `triggerInitialPaymentActions` en `pagacuotas-integration.service.ts` ejecuta `at_informa.case.create` async sin retry persistente. Si falla, queda log `at_informa.case.create.failed` pero no se reintenta.
- **`safeEqual` duplicado** en `internal-api.ts`, `api-auth.ts` (service-control), `retry-sweep/route.ts`, `webhooks/crm/route.ts`. Refactor a helper compartido pendiente.

---

## Contacto / dueños

- Cambios en este flow requieren review de los dueños de los 3 módulos. Documentar nuevas integraciones aquí antes de mergear.
- Si introduces nueva ruta inbound/outbound: agregar a las tablas correspondientes, mencionar auth, registrar el evento si aplica.
