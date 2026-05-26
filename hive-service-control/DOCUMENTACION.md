# AT INFORMA v3.0 — Documentación Oficial del Proyecto

> **Versión:** 3.0
> **Fecha:** Abril 2026
> **Cliente:** Abogados Tributarios Chile
> **Estado:** Final-Mission — embudo legal completo, mensajería realtime, ciclo de cobranza con escalamiento 3 meses.

---

## Tabla de contenidos

1. [Descripción general](#1-descripción-general)
2. [Stack tecnológico](#2-stack-tecnológico)
3. [Modelo de datos v3.0](#3-modelo-de-datos-v30)
4. [Roles y matriz de permisos](#4-roles-y-matriz-de-permisos)
5. [Embudo legal — máquina de estados](#5-embudo-legal--máquina-de-estados)
6. [Ingesta desde el CRM](#6-ingesta-desde-el-crm)
7. [Bandeja del SuperAdmin (Double Check)](#7-bandeja-del-superadmin-double-check)
8. [Asignación obligatoria por Jefe de Mesa](#8-asignación-obligatoria-por-jefe-de-mesa)
9. [Escalamiento de mora 3 meses](#9-escalamiento-de-mora-3-meses)
10. [Reactivación de casos](#10-reactivación-de-casos)
11. [Mensajería realtime (Supabase)](#11-mensajería-realtime-supabase)
12. [Workers (BullMQ)](#12-workers-bullmq)
13. [Notificaciones (WhatsApp + Email)](#13-notificaciones-whatsapp--email)
14. [Row-Level Security](#14-row-level-security)
15. [Endpoints REST](#15-endpoints-rest)
16. [Variables de entorno](#16-variables-de-entorno)
17. [Scripts disponibles](#17-scripts-disponibles)
18. [Pruebas (ver doc de carga masiva)](#18-pruebas-ver-doc-de-carga-masiva)

---

## 1. Descripción general

**AT INFORMA v3.0** es el *Legal Operating System* de Abogados Tributarios Chile. Reemplaza el panel anterior (basado en planillas Excel) por un sistema con embudo legal cerrado: ingesta validada, Double Check del SuperAdmin, asignación obligatoria, escalamiento de mora automatizado y portal del cliente con visibilidad total.

### Objetivos

- **Garantizar que todo caso tenga abogado asignado** antes de pasar a `IN_PROGRESS`.
- **Cobrar antes de trabajar:** sin pago inicial validado no se asigna abogado.
- **Escalamiento progresivo de mora** (3 meses) en lugar de corte inmediato.
- **Realtime para cliente y staff:** chat dual, sincronización instantánea de estado.
- **Auditoría total:** cada acción crítica deja registro en `AuditLog`.

---

## 2. Stack tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| Framework | Next.js (App Router) | 14.2.35 |
| Lenguaje | TypeScript | ^5 |
| ORM | Prisma | ^5.22.0 |
| Base de datos | PostgreSQL (Supabase) | — |
| Realtime | Supabase Realtime | ^2 |
| Autenticación | NextAuth v5 | beta.31 |
| Cola de jobs | BullMQ + Redis | ^5.76 |
| Estilos | TailwindCSS | ^3.4 |
| Email | Resend | ^6.12 |
| WhatsApp | Meta Cloud API v19.0 | — |
| Validación | Zod | ^4.3 |
| Estado UI | Zustand | ^5.0 |
| Reportes | SheetJS (xlsx) | ^0.18 |
| Deploy | Vercel + Railway (worker) | — |

> Decisión arquitectónica: **Supabase Realtime** (no Socket.io) para el chat dual cliente/staff. Documentada en memoria del proyecto.

---

## 3. Modelo de datos v3.0

Todos los modelos viven en `prisma/schema.prisma`. RLS aplicado vía `prisma/sql/rls.sql`.

### Enums clave

```prisma
enum Role { SUPER_ADMIN  JEFE_DE_MESA  ABOGADO  CLIENTE  SISTEMA_CUOTAS }

enum CaseStage { OPEN  IN_PROGRESS  FINISHED  HALTED_BY_PAYMENT  WAITING_CUOTAS }

enum PaymentStatus { PAID  UNPAID  OVERDUE  RESTORED }

enum CaseCategory { TRIBUTARIO PENAL CIVIL LABORAL FAMILIA MIGRATORIO OTRO }

enum AuditAction {
  WHATSAPP_SENT  WHATSAPP_FAILED  EMAIL_SENT  EMAIL_FAILED
  CASE_HALTED    CASE_REACTIVATED CASE_FINISHED CASE_DERIVED CASE_ASSIGNED
  PAYMENT_RECORDED  SATISFACTION_SUBMITTED
}
```

### Modelos principales

| Modelo | Función |
|---|---|
| `User` | Único modelo de personas (staff y clientes), discriminado por `role`. Jerarquía vía `managedById`. |
| `Case` | Caso legal — corazón del sistema. Lleva `stage`, `is_paid`, `unpaid_months`, `initial_invoice`, asignación M:N de abogados y FK a `jefe_mesa`. |
| `Category` | Categorías legales (tabla dinámica, upsert por nombre). |
| `Comment` | Comentarios INTERNAL (staff) o PUBLIC (chat dual con cliente). |
| `Update` | Actualizaciones públicas en el portal del cliente (con `document_url`). |
| `PaymentEvent` | Historial de pagos. PAID/RESTORED disparan reactivación; OVERDUE dispara halt. |
| `AuditLog` | Bitácora obligatoria de toda acción crítica. |

### Campos sensibles en `Case`

| Campo | Uso |
|---|---|
| `stage` | Estado en la máquina (OPEN, IN_PROGRESS, etc.) |
| `is_paid` | Pago inicial validado por SuperAdmin |
| `unpaid_months` | Contador de mora — incrementado por `health-sweep` cada 30 días |
| `last_health_check_at` | Marca para evitar doble-incremento del contador |
| `halted_at` / `halted_reason` | Trazabilidad del HALT |
| `initial_invoice` | URL del comprobante cargado al onboarding |
| `metadata.source` | `"CRM_DANTE"` para casos validados externamente |

---

## 4. Roles y matriz de permisos

| Acción | SUPER_ADMIN | JEFE_DE_MESA | ABOGADO | CLIENTE | SISTEMA_CUOTAS |
|---|:-:|:-:|:-:|:-:|:-:|
| Ingesta CRM (vía webhook) | ✓ | — | — | — | — |
| Double Check / derivar a Jefe | ✓ | — | — | — | — |
| Asignar abogados a un caso | — | ✓ | — | — | — |
| Comentar (PUBLIC) | ✓ | ✓ | ✓ | ✓ | — |
| Comentar (INTERNAL) | ✓ | ✓ | ✓ | — | — |
| Cerrar caso (`FINISHED`) | ✓ | ✓ | ✓ (con permiso) | — | — |
| Regularizar pago en mora | ✓ | — | — | — | ✓ (vía workflow) |
| Ver portal `/portal` | — | — | — | ✓ | — |
| Ver `/admin/equipo` | ✓ | — | — | — | — |
| Ver `/admin/mora` | ✓ | — | — | — | — |

> Estos gates están enforzados en server actions (`use server`) **y** RLS de PostgreSQL — defensa en profundidad.

---

## 5. Embudo legal — máquina de estados

```
                      ┌──────────────────────────────┐
                      │  CRM DANTE (validación ext.) │
                      └─────────────┬────────────────┘
                                    │ POST /api/webhooks/crm
                                    ▼
                              ┌──────────┐
                              │   OPEN   │  ← invoice cargada, esperando Double Check
                              └────┬─────┘
       ┌──── is_paid=false ────────┤
       ▼                           ▼ is_paid=true + SuperAdmin deriva + Jefe asigna
┌────────────────┐         ┌────────────────┐
│ WAITING_CUOTAS │         │  IN_PROGRESS   │ ← abogado trabaja
└──────┬─────────┘         └────┬───────┬───┘
       │ Sistema de Cuotas       │       │ caso resuelto
       │ regulariza              │       ▼
       │                         │   ┌──────────┐
       │                         │   │ FINISHED │
       │                         │   └──────────┘
       │ pago>24h sin validar    │
       ▼                         │ mora mes 3
┌──────────────────────┐         │
│ HALTED_BY_PAYMENT    │◄────────┘
└──────────┬───────────┘
           │ regulariza pago (recordPaymentEvent PAID/RESTORED)
           │   - User.active = true
           │   - reactivateCaseIfPaid:
           │       lawyers? → IN_PROGRESS    : OPEN (re-Double-Check)
           ▼
       (vuelta al nodo correspondiente)
```

Transiciones permitidas (enforzadas por `canTransition` en `case-health.ts:54`):

| De → A | OPEN | IN_PROGRESS | HALTED_BY_PAYMENT | WAITING_CUOTAS | FINISHED |
|---|:-:|:-:|:-:|:-:|:-:|
| OPEN | — | ✓ | ✓ | ✓ | — |
| IN_PROGRESS | — | — | ✓ | — | ✓ |
| HALTED_BY_PAYMENT | ✓ | ✓ | — | — | — |
| WAITING_CUOTAS | ✓ | ✓ | ✓ | — | — |
| FINISHED | — | — | — | — | — |

---

## 6. Ingesta desde el CRM

Webhook canónico: `POST /api/webhooks/crm`. Detalle completo en
`DOCUMENTACION_CARGA_MASIVA.md` § 2.

Resumen del servicio (`src/lib/services/crm-onboarding.ts`):

1. Hash de password determinístico → `firstName(4) + last4Phone`.
2. `User.upsert` — crea o reactiva el cliente.
3. `Category.upsert` por nombre.
4. `Case.create` con `initial_invoice`, `is_paid` derivado de la presencia de `invoiceUrl`.
5. `AuditLog: PAYMENT_RECORDED` con metadata de origen.
6. `enqueueWhatsApp({ kind: "client_credentials" })` + `enqueueEmail` — entrega de credenciales.
7. Si pagó: `payment_receipt`. Si no: `initial_invoice`.

---

## 7. Bandeja del SuperAdmin (Double Check)

Ruta: `/admin/bandeja`. Server actions en `src/app/admin/bandeja/actions.ts`.

| Acción | Función | Gate |
|---|---|---|
| Ver casos pendientes con sello `CRM_DANTE` | render server-side | `Role.SUPER_ADMIN` |
| Validar pago inicial | persiste `is_paid = true` + `PaymentEvent PAID` | `Role.SUPER_ADMIN` |
| Derivar a Jefe de Mesa | `deriveCaseToJefeMesa` | `is_paid = true` ∧ `Role.SUPER_ADMIN` |
| Halt manual | `forceHalt` | `Role.SUPER_ADMIN` |

---

## 8. Asignación obligatoria por Jefe de Mesa

Función `assignCaseToAbogados` (`bandeja/actions.ts:47`).

- Solo `Role.JEFE_DE_MESA`.
- Requiere `is_paid = true`.
- Asigna lista de abogados (M:N).
- **Transiciona automáticamente** `OPEN → IN_PROGRESS` — esto materializa la regla "obligatorio asignar para pasar a IN_PROGRESS".
- Genera `AuditLog: CASE_ASSIGNED`.

Para asignación con load-balancing (auto-pick del abogado con menos casos): `src/lib/services/assignment.ts → autoAssignCase`.

Para reasignación o "Power Assignment" del SuperAdmin: `powerAssignCase` / `reassignCase`.

---

## 9. Escalamiento de mora 3 meses

Implementado en `src/lib/case-health.ts → checkCaseHealth`. Disparado por el worker `health-sweep` (`src/lib/workers/health-sweep.ts`) cada hora sobre todo caso `OPEN/IN_PROGRESS/WAITING_CUOTAS`.

Lógica:

| Mes | `unpaid_months` | Stage resultante | Notificaciones | Cuenta cliente |
|---|---|---|---|---|
| 1 | 1 | `IN_PROGRESS` (sigue trabajando) | `non_payment_warning` (WhatsApp + Email) | activa |
| 2 | 2 | `IN_PROGRESS` (sigue trabajando) | `overdue_notice` | activa |
| 3 | ≥ 3 | **`HALTED_BY_PAYMENT`** | `overdue_notice` final | **`active = false`** |

El contador sólo incrementa si `last_health_check_at` es `null` o anterior a 30 días — protección contra doble-conteo.

> El abogado ve un `HaltedOverlay` (componente) sobre el caso cuando entra a `HALTED_BY_PAYMENT`. Las acciones de escritura quedan bloqueadas por `assertCaseActive`.

---

## 10. Reactivación de casos

Función `reactivateCaseIfPaid` (`case-health.ts:276`).

Disparada por:
- SuperAdmin desde `/admin/mora` → server action `regularizeCase`.
- `recordPaymentEvent` con `status` PAID o RESTORED.

Comportamiento:
- Si el caso tenía abogados asignados → **`IN_PROGRESS`**.
- Si no → **`OPEN`** (re-entra al Double Check).
- `User.active = true` (cliente recupera acceso al portal).
- `unpaid_months = 0`, `halted_at = null`.
- Encola `payment_receipt`.
- `AuditLog: CASE_REACTIVATED`.

---

## 11. Mensajería realtime (Supabase)

Decisión: **Supabase Realtime** (no Socket.io) — registra eventos en tablas y suscribe los clientes.

| Componente | Archivo |
|---|---|
| Chat dual cliente/staff | `src/components/messenger/CaseChatTabs.tsx` |
| Cliente | `src/components/messenger/ClientChat.tsx` |
| Staff | `src/components/messenger/StaffChat.tsx` |
| Sincronización de estado del caso | `src/components/RealtimeCaseSync.tsx` |

Los `Comment` con `type=PUBLIC` aparecen en ambos lados; los `INTERNAL` sólo entre staff. RLS impide que el cliente lea internos.

---

## 12. Workers (BullMQ)

Punto de entrada: `src/worker.ts`.

| Cola | Función | Frecuencia |
|---|---|---|
| `whatsapp` | Envía vía Meta Cloud API, registra audit | event-driven |
| `email` | Envía vía Resend, registra audit | event-driven |
| `health-sweep` | Recorre casos activos, ejecuta `checkCaseHealth` (escalamiento mora) | cada hora |
| `executioner` | Tareas de cierre, vencimientos, halt automático | event-driven |

Levantar localmente: `npm run dev`. Ese comando arranca la app y el motor local de procesamiento. En Vercel, el motor se visualiza para SuperAdmin desde `/admin/monitoreo` dentro de la misma URL del sistema.

---

## 13. Notificaciones (WhatsApp + Email)

API uniforme: `enqueueWhatsApp({ kind, caseId })` y `enqueueEmail({ kind, caseId })` (`src/lib/notifications.ts`).

Plantillas (`kind`):

| Kind | Disparo |
|---|---|
| `client_credentials` | Onboarding desde CRM — entrega usuario/contraseña |
| `payment_receipt` | Pago validado por SuperAdmin / Sistema de Cuotas |
| `initial_invoice` | Cliente sin pagar tras ingesta |
| `non_payment_warning` | Mes 1 de mora |
| `overdue_notice` | Mes 2 y 3 de mora |
| `case_update` | Nueva `Update` con `notify=true` |
| `case_finished` | Cierre del caso |

WhatsApp Cloud API exige plantillas aprobadas para envíos fuera de la ventana 24h del cliente — pendiente registrar las plantillas finales en Meta Business Manager.

---

## 14. Row-Level Security

Archivo: `prisma/sql/rls.sql`. Aplicar con `npm run db:rls`.

- Cada modelo tiene políticas `SELECT/INSERT/UPDATE/DELETE` por rol y por relación.
- Cliente sólo ve sus propios casos, comentarios PUBLIC y updates.
- Abogado sólo ve casos donde aparece en `CaseLawyers` o donde es `jefe_mesa`.
- SuperAdmin ve todo.
- El acceso "system" (workers, webhooks, server actions) usa `withSystemRls` — bypass controlado vía rol DB elevado.

> Helper de aplicación: `src/lib/rls.ts → withRls(callback)` y `withSystemRls(callback)`.

---

## 15. Endpoints REST

Sólo se documentan los públicos / críticos. El resto son rutas internas de Next.js (`use server` actions y páginas).

| Método | Ruta | Auth | Función |
|---|---|---|---|
| POST | `/api/webhooks/crm` | `x-webhook-signature` | Ingesta de leads desde Dante |
| POST | `/api/casos` | `x-crm-secret` | Ingesta legacy con `client_id` ya existente |
| POST | `/api/webhooks/flow` | Token Flow | Webhook de pasarela Flow.cl |
| POST | `/api/webhooks/webpay` | Token Webpay | Webhook de Webpay (Transbank) |
| GET/POST | `/api/auth/[...nextauth]` | NextAuth | Login dual (staff vs cliente) |

---

## 16. Variables de entorno

```env
# Base de datos
DATABASE_URL="postgresql://...:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...:5432/postgres"

# NextAuth v5
AUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"

# Ingesta CRM
CRM_WEBHOOK_SECRET="..."
CRM_INGEST_SECRET="..."

# Meta WhatsApp
META_WHATSAPP_TOKEN="..."
META_WHATSAPP_PHONE_ID="..."
META_WHATSAPP_VERIFY_TOKEN="..."

# Resend (email)
RESEND_API_KEY="..."
RESEND_FROM_EMAIL="AT Informa <noreply@atinforma.cl>"

# Supabase (Realtime + Storage)
SUPABASE_URL="..."
SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_KEY="..."

# Redis (BullMQ)
REDIS_URL="redis://..."

# IA
OPENAI_API_KEY="..."
ANTHROPIC_API_KEY="..."

# Cron
CRON_SECRET="..."

# App
APP_URL="https://atinforma.cl"
```

---

## 17. Scripts disponibles

```bash
# Dev
npm run dev              # Next.js :3000 + motor local de procesamiento
npm run build
npm run start
npm run lint

# Base de datos
npm run db:push          # sync schema sin migración (dev)
npm run db:migrate       # crear y aplicar migración versionada
npm run db:seed          # usuarios base (jorge / jefe / abogado / cliente / cuotas)
npm run db:rls           # aplicar políticas RLS
npm run db:studio        # Prisma Studio

# Pruebas
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-test-cases.ts   # 12 casos de prueba
```

---

## 18. Pruebas (ver doc de carga masiva)

Toda la operación de pruebas del embudo (carga masiva, Double Check, asignación, escalamiento de mora, reactivación) está documentada en:

→ **[DOCUMENTACION_CARGA_MASIVA.md](./DOCUMENTACION_CARGA_MASIVA.md)**

Incluye:
- Mapa código ↔ spec del embudo.
- Comandos `curl` para enviar leads al webhook CRM.
- Pre-condiciones SQL para forzar Mes 1 / Mes 2 / Mes 3 de mora.
- Checklist de cumplimiento del embudo.
- Fixtures pre-sembradas y credenciales.

---

*Última actualización: 2026-04-30 — alineado a `prisma/schema.prisma` y a la rama Final-Mission.*
