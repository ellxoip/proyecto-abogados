# Legal Finance MVP (SIS.CONTABLE)

Sistema interno financiero-contable para gestion de clientes, contratos, cuotas, pagos e integraciones externas.

## Resumen

SIS.CONTABLE es la fuente de verdad de:
- deuda
- cuotas
- pagos
- saldos
- estado de contratos

PagaCuotas actua como pasarela de cobro. No crea clientes ni contratos en SIS.CONTABLE; solo consulta deuda/cuotas y reporta eventos de pago.

AT-INFORMA se integra para sincronizacion de informacion legal/financiera.

## Stack

- Next.js 16 (App Router + Route Handlers)
- TypeScript
- Prisma ORM
- PostgreSQL (Supabase)
- Zod
- Vitest
- ESLint

## Requisitos

- Node.js 20+
- npm 10+
- Proyecto Supabase con PostgreSQL (provee DATABASE_URL y DIRECT_URL)

## Variables de entorno

Configurar `.env` desde `.env.example`.

Variables base:

```bash
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"
APP_URL="http://localhost:3000"
JWT_SECRET="change-this-secret-in-local"
AT_INFORMA_API_URL="https://at-informa.cl"
AT_INFORMA_API_KEY="clave_bearer_token"
PAGACUOTAS_INTERNAL_API_KEY="clave_interna_pagacuotas"
PAGACUOTAS_INTERNAL_BEARER_TOKEN="bearer_interno_pagacuotas"
```

> `DATABASE_URL` usa PgBouncer (pooled) para el servidor. `DIRECT_URL` es conexión directa para migraciones Prisma.

Notas de auth interna para PagaCuotas:
- cada endpoint interno acepta `x-api-key` o `Authorization: Bearer <token>`
- las credenciales se leen desde las variables anteriores

## Instalacion y ejecucion local

```bash
npm install
npx prisma generate
npx prisma db push
npm run prisma:seed
npm run dev
```

App local:
- [http://localhost:3000](http://localhost:3000)

## Calidad y build

```bash
npm test
npm run lint
npm run build
```

## Usuarios demo (seed)

- `admin@legalfinance.local` / `Admin123!`
- `contador@legalfinance.local` / `Contador123!`

## Integracion PagaCuotas (interna)

### Endpoints de consulta para PagaCuotas

- `GET /api/integrations/pagacuotas/deudas/:identifier`
  - busca cliente por rut, email o id
  - responde cliente, resumen de deuda, contratos activos, total cuotas, cuotas pagadas, cuotas pendientes, monto pendiente y monto vencido

- `GET /api/integrations/pagacuotas/contratos/:contratoId/cuotas`
  - responde cuotas del contrato con:
  - `id`, `numero`, `monto`, `saldo`, `fecha_vencimiento`, `estado`, `pagable`

### Validacion previa de intencion de pago

- `POST /api/integrations/pagacuotas/payment-intents/validate`
  - valida cliente, contrato, cuotas, estados permitidos y monto exacto
  - idempotencia por `external_attempt_id`
  - respuesta: `valid` y `errors`

### Eventos de pago

- `POST /api/integrations/pagacuotas/payments/confirmed`
  - idempotencia por `external_payment_id`
  - registra pago, aplica a cuotas, recalcula cuota/contrato y deja trazabilidad de integracion

- `POST /api/integrations/pagacuotas/payments/rejected`
  - registra intento rechazado
  - no marca cuotas como pagadas

- `POST /api/integrations/pagacuotas/payments/reversed`
  - valida pago original
  - registra reversa
  - devuelve cuotas a estado pendiente/vencida segun corresponda
  - recalcula saldo/estado y crea log de integracion

## Integracion AT-INFORMA

### Endpoint interno de sincronizacion

- `POST /api/internal/sync/at-informa`
- requiere sesion (cookie `lf_session`)

Body opcional:

```json
{
  "solo_pendientes": true,
  "desde": "2026-05-01",
  "hasta": "2026-05-31"
}
```

### Endpoints externos usados por SIS.CONTABLE

- `GET /api/v1/plan-pagos`
- `POST /api/v1/pagos`

## Endpoints publicos del portal de pagos

- `GET /api/public/payment-portal/clientes/:identifier/deudas`
- `GET /api/public/payment-portal/contratos/:contratoId/cuotas`

## Reportes

- UI: `/reportes`
- API:
  - `/api/reportes/pagos`
  - `/api/reportes/cxc`
  - `/api/reportes/vencimientos`
  - `/api/reportes/morosidad`
  - `/api/reportes/proyeccion`

CSV:
- usar `?format=csv`
- ejemplo:
  - `/api/reportes/pagos?from=2026-01-01&to=2026-12-31&format=csv`

## Estructura relevante

```text
prisma/
  schema.prisma
  migrations/
src/
  app/
    api/
      integrations/pagacuotas/
      internal/sync/at-informa/
      public/payment-portal/
      reportes/
  lib/
  server/
    auth/
    integrations/at-informa/
    services/integrations/
```

## Estado actual

Implementado y verificado:
- modelo financiero base (clientes, contratos, cuotas, pagos)
- logica de pago y recalculo de estados
- integracion SIS.CONTABLE <-> PagaCuotas (consulta, validacion y eventos)
- integracion SIS.CONTABLE <-> AT-INFORMA
- tests unitarios e integracion (Vitest)

## Notas

- Next.js muestra advertencia deprecada sobre `middleware` -> `proxy`; es advertencia no bloqueante.
- Para guia rapida del proyecto, revisar `startup.md`.
