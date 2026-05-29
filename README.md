# PagaCuotas - Sistema Empresarial de Gestión de Pagos

**PagaCuotas** es un sistema backend y frontend robusto, diseñado para centralizar y orquestar el cobro de cuotas. Funciona como el puente definitivo entre los sistemas internos de la empresa (como **SIS.CONTABLE** y **CRM**) y múltiples pasarelas de pago externas.

---

## Stack Tecnológico

**Backend (API Rest):**
- **Core:** Node.js, Express, TypeScript
- **Base de Datos & ORM:** Prisma + PostgreSQL (Supabase)
- **Validación:** Zod

**Frontend (Portal):**
- **Core:** React 19, TypeScript, Vite
- **Estilos y UI:** Tailwind CSS v4, Framer Motion, Lucide React
- **Enrutamiento:** React Router v7

---

## Arquitectura

### 1. Capa de Abstracción de Pasarelas (Provider Gateway Layer)
Arquitectura multi-proveedor que permite integrar y alternar pasarelas de pago sin modificar la lógica central del negocio.
- **Proveedor activo:** MercadoPago. Simulator disponible para desarrollo y QA.
- **Simulador Integrado:** Proveedor `simulator` con reglas deterministas basadas en el monto para pruebas E2E sin APIs externas.
- **Entornos:** Soporte nativo para modo `sandbox` y `production`.

### 2. Sincronización Dual y Resiliencia
- **SIS.CONTABLE (Fuente de la Verdad):** Se valida la deuda antes de intentar el cobro. Los pagos aprobados, rechazados y reversados se sincronizan automáticamente.
- **CRM (FastAPI):** Se notifican los pagos exitosos vía JWT autenticado para actualizar el pipeline de ventas e iniciar flujos de WhatsApp.
- **Cola de Reintentos (Backoff Exponencial):** Si el CRM o SIS.CONTABLE están caídos durante un Webhook, el sistema encola la notificación y reintenta con `OutboxService`.

### 3. Seguridad y Trazabilidad Total
- **Idempotencia:** Protección contra webhooks duplicados de los proveedores de pago.
- **Integration Logs:** Cada petición HTTP hacia sistemas externos queda registrada con tiempos de respuesta y payloads para auditoría.
- **RLS (Row Level Security):** Políticas de acceso por RUT en Supabase — un usuario solo puede leer sus propios datos.
- **Validación Estricta:** Zod en todos los endpoints.

---

## Base de Datos — Supabase (PostgreSQL)

El proyecto utiliza **Supabase** como base de datos PostgreSQL con las siguientes 11 tablas:

| Tabla | Descripción |
|-------|-------------|
| `CrmClientProfile` | Perfil de cliente sincronizado desde CRM |
| `PaymentPortalSession` | Sesión temporal del portal de pago |
| `PaymentAttempt` | Intento de pago con validación SIS.CONTABLE |
| `Payment` | Pago confirmado con tracking de sincronización |
| `BillingDocument` | Boleta/factura/nota de crédito (SII DTE) |
| `PaymentReversal` | Reversas y reembolsos |
| `IntegrationLog` | Audit trail de todas las llamadas sistema-a-sistema |
| `IntegrationOutbox` | Outbox pattern para eventos pendientes |
| `DeadLetterQueue` | Eventos fallidos para resolución manual |
| `ReconciliationRun` | Jobs de reconciliación batch |
| `SupportTicket` | Tickets de soporte del portal cliente |

Los campos JSON se almacenan como **JSONB nativo** de PostgreSQL. Los campos monetarios usan `DECIMAL(12,2)`.

### RLS (Row Level Security)
Las políticas RLS están en `prisma/rls_policies.sql`. El backend (Prisma como superusuario) bypasea RLS. Las políticas aplican para acceso directo por RUT a través del rol `anon`.

---

## Configuración

### 1. Instalar dependencias
```bash
npm install
```

### 2. Variables de Entorno
Copia `.env.example` a `.env` y configura:

```env
# Base de Datos (Supabase)
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"

# SIS.CONTABLE
SIS_CONTABLE_BASE_URL=http://localhost:3000
SIS_CONTABLE_API_KEY=tu_api_key

# CRM
CRM_BASE_URL=http://localhost:8000
CRM_EMAIL=admin@example.com
CRM_PASSWORD=tu_password

# Pagos
PAYMENT_ENVIRONMENT=sandbox
PAYMENT_DEFAULT_PROVIDER=simulator
```

### 3. Preparar Base de Datos
```bash
# Generar cliente Prisma
npx prisma generate

# Aplicar migraciones a Supabase
npx prisma migrate dev --name init_supabase

# (Opcional) Aplicar políticas RLS en Supabase SQL Editor
# Copiar y ejecutar: prisma/rls_policies.sql
```

---

## Ejecución

```bash
# API Backend (Puerto 4000)
npm run server

# Portal Frontend (Puerto 3002)
npm run dev
```

### Health Check
```bash
curl http://localhost:4000/api/health
```

### Simulación de Flujos (Tests de Integración)
```bash
npm run integration:simulate-flow
```

---

## Estructura de Directorios

```
server/
├── providers/      # Abstracción de pasarelas de pago
├── services/       # Lógica central (pagos, outbox, reconciliación)
├── clients/        # Clientes HTTP para SIS.CONTABLE y CRM
├── billing/        # Integración SII DTE (AuthCL)
├── controllers/    # Handlers de Express
├── routes/         # Definición de rutas API
└── validators/     # Esquemas Zod

src/
└── pages/          # React — Portal Cliente y Dashboard Admin

prisma/
├── schema.prisma       # Schema PostgreSQL
├── migrations/         # Historial de migraciones
└── rls_policies.sql    # Políticas Row Level Security
```
