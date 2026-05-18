# AT INFORMA v3.0 — Carga Masiva y Pruebas del Embudo

> Documento operativo para validar la **carga masiva desde el CRM (Dante)** y el embudo legal completo: Double Check → Asignación obligatoria → Escalamiento de mora 3 meses → Reactivación.
>
> **Endpoint canónico de ingesta:** `POST /api/webhooks/crm` (consumido por Dante).
> **Endpoint legacy / interno:** `POST /api/casos` (requiere `client_id` ya existente; útil sólo para QA).

---

## 0. Mapa del embudo (correspondencia código ↔ spec)

| Paso de la spec | Implementación actual | Archivo |
|---|---|---|
| **1. Double Check de At Informa** | Bandeja del SuperAdmin valida pago + deriva a Jefe de Mesa | `src/app/admin/bandeja/actions.ts → deriveCaseToJefeMesa` |
| **1b. Asignación obligatoria → IN_PROGRESS** | Jefe de Mesa asigna abogados; transiciona `OPEN → IN_PROGRESS` automáticamente | `src/app/admin/bandeja/actions.ts → assignCaseToAbogados` |
| **2. Onboarding privado (no magic link)** | Genera `firstName + last 4 digits del phone` y los envía por WhatsApp + Email | `src/lib/services/crm-onboarding.ts → onboardClientFromCRM` |
| **2b. Boleta cargada en el portal** | Campo `Case.initial_invoice` se persiste con la URL del comprobante | `crm-onboarding.ts:115` |
| **3. Mes 1 mora — aviso, sigue trabajando** | `unpaid_months === 1` → `non_payment_warning` (WhatsApp + Email), `stage` se mantiene `IN_PROGRESS` | `src/lib/case-health.ts:163-167` |
| **3b. Mes 2 mora — aviso intensificado** | `unpaid_months === 2` → `overdue_notice`, sigue `IN_PROGRESS` | `case-health.ts:168-171` |
| **3c. Mes 3 mora — HALT + suspensión cuenta** | `unpaid_months >= 3` → `HALTED_BY_PAYMENT`, `User.active = false`, `overdue_notice` | `case-health.ts:171-188` |
| **4. Reactivación al regularizar** | Vuelve a OPEN si no había abogados, IN_PROGRESS si sí. Reactiva `User.active` | `case-health.ts → reactivateCaseIfPaid` |

> ✔ El embudo cumple la spec. Esta sección es la **checklist de verificación** que se valida con las pruebas de las secciones 3–7.

---

## 1. Pre-requisitos de entorno

```bash
# 1. Migrar y sembrar
npm run db:migrate
npm run db:seed                 # crea SuperAdmin, Jefe, Abogada, Cliente demo
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-test-cases.ts

# 2. Aplicar políticas RLS (obligatorio en v3.0)
npm run db:rls

# 3. Levantar servicios
npm run dev                     # Next.js en :3000 + motor local de procesamiento
```

Variables `.env` mínimas para que el embudo funcione:

```env
CRM_WEBHOOK_SECRET="..."        # secreto compartido con Dante
CRM_INGEST_SECRET="..."         # secreto del endpoint legacy /api/casos
META_WHATSAPP_TOKEN="..."
META_WHATSAPP_PHONE_ID="..."
RESEND_API_KEY="..."
NEXTAUTH_URL="http://localhost:3000"
APP_URL="http://localhost:3000"
```

---

## 2. Carga masiva desde el CRM (entrada oficial)

### 2.1 Payload validado por Dante

El CRM envía un POST por cada lead aprobado. La firma se valida con `x-webhook-signature`.

```http
POST /api/webhooks/crm
Content-Type: application/json
x-webhook-signature: <CRM_WEBHOOK_SECRET>

{
  "fullName": "Juan Pérez Mora",
  "email":    "juan.perez@cliente.cl",
  "phone":    "+56912345678",
  "category": "LABORAL",
  "invoiceUrl": "https://flow.cl/comprobante/abc123",   // opcional → marca is_paid=true
  "caseCode":   "AT-CRM-2026-0001"                      // opcional → si no, se genera
}
```

### 2.2 Lo que hace el sistema (verificable en logs / DB)

1. **Crea o reutiliza** el `User` con rol `CLIENTE` (`crm-onboarding.ts:73-98`).
2. **Genera credenciales privadas determinísticas**: `firstName(4 chars) + last4Phone`.
   - Ej: `"Juan Pérez" + "+56912345678"` → contraseña `Juan5678`.
3. **Crea el `Case`** con `initial_invoice` poblado y `stage = OPEN` si pagó, `WAITING_CUOTAS` si no.
4. **Encola notificaciones**:
   - `client_credentials` (WhatsApp + Email) — entrega usuario/contraseña al cliente.
   - `payment_receipt` si `isPaid`, o `initial_invoice` si no.
5. **Audit log** `PAYMENT_RECORDED` con el detalle de origen CRM.

### 2.3 Carga masiva real (lote)

El webhook acepta UN lead por request. Para cargar un Excel/CSV de Dante, recorrer línea a línea:

```bash
# bulk-ingest.sh — recibe leads.csv (fullName,email,phone,category,invoiceUrl)
while IFS=, read -r name email phone cat invoice; do
  curl -s -X POST http://localhost:3000/api/webhooks/crm \
    -H "Content-Type: application/json" \
    -H "x-webhook-signature: $CRM_WEBHOOK_SECRET" \
    -d "{\"fullName\":\"$name\",\"email\":\"$email\",\"phone\":\"$phone\",\"category\":\"$cat\",\"invoiceUrl\":\"$invoice\"}"
  echo
done < leads.csv
```

### 2.4 Endpoint legacy `POST /api/casos` (sólo para QA / sembrado interno)

Requiere que el `client_id` exista previamente en la tabla `users`.

```http
POST /api/casos
x-crm-secret: <CRM_INGEST_SECRET>

{
  "client_id": "<UUID>",
  "code": "AT-TEST-101",
  "is_paid": true,
  "category": "TRIBUTARIO"
}
```

> Acepta objeto **o array** de objetos. No genera credenciales — se asume que el cliente ya existe.

---

## 3. Prueba del Paso 1 — Double Check del SuperAdmin

### 3.1 Visualizar la bandeja

1. Login como SuperAdmin: `jorge@atinforma.cl / Admin2026!`.
2. Ir a `/admin/bandeja`.
3. Los casos recién ingresados aparecen con sello **`source: CRM_DANTE`** en el badge de confianza.

### 3.2 Verificación de gates

| Acción | Quién | Pre-condición | Resultado esperado |
|---|---|---|---|
| `deriveCaseToJefeMesa` | SUPER_ADMIN | `is_paid = true` | OK |
| `deriveCaseToJefeMesa` | SUPER_ADMIN | `is_paid = false` | **Error**: `Cannot derive: initial payment not validated.` |
| `deriveCaseToJefeMesa` | JEFE_DE_MESA / ABOGADO | — | **Error**: `forbidden: only SuperAdmin may derive cases` |
| `assignCaseToAbogados` | JEFE_DE_MESA | `is_paid = true` | Stage transiciona a `IN_PROGRESS` |
| `assignCaseToAbogados` | SUPER_ADMIN / ABOGADO | — | **Error**: `forbidden: only Jefe de Mesa may assign lawyers` |

### 3.3 Asignación obligatoria

La spec dice: **"Una vez confirmado el Double Check, el caso debe ser asignado a un abogado para pasar a IN_PROGRESS"**.
La implementación lo cumple en `assignCaseToAbogados` (`bandeja/actions.ts:71`):

```ts
stage: kase.stage === CaseStage.OPEN ? CaseStage.IN_PROGRESS : kase.stage
```

**Test manual:**
1. Crea un caso vía `/api/webhooks/crm` con `invoiceUrl` (paga) → `stage = OPEN`.
2. Login como SuperAdmin → deriva a Jefe de Mesa (`jefe@atinforma.cl`).
3. Login como Jefe de Mesa (`jefe@atinforma.cl / Jefe2026!`) → asigna abogado.
4. Verifica:
   ```sql
   SELECT code, stage, jefe_mesa_id FROM cases WHERE code = 'AT-CRM-...';
   -- stage debe ser IN_PROGRESS
   ```

---

## 4. Prueba del Paso 2 — Onboarding privado y portal

### 4.1 Login del cliente

Tras la carga, el cliente recibe (WhatsApp + Email):

```
Usuario: juan.perez@cliente.cl
Contraseña: Juan5678
URL: https://atinforma.cl/login
```

> No se usan magic links — la spec lo exige por privacidad familiar. Verificado en `notifications.ts → buildClientCredentialsMessage`.

### 4.2 Boleta visible en el portal

Login del cliente → la página `/portal/casos/[id]` debe renderizar la URL de `initial_invoice` como adjunto descargable desde el primer ingreso.

**Test:**
```sql
SELECT code, initial_invoice FROM cases WHERE code = 'AT-CRM-2026-0001';
-- initial_invoice debe contener la URL enviada en el webhook
```

---

## 5. Prueba del Paso 3 — Escalamiento 3 meses

El worker `health-sweep` corre periódicamente y por cada caso `OPEN/IN_PROGRESS/WAITING_CUOTAS` no chequeado en la última hora ejecuta `checkCaseHealth`. La lógica de escalamiento usa `unpaid_months` y `last_health_check_at`.

### 5.1 Forzar Mes 1

```sql
-- Caso debe tener is_paid = false y stage = IN_PROGRESS
UPDATE cases
SET is_paid = false,
    unpaid_months = 0,
    last_health_check_at = NULL
WHERE code = 'AT-TEST-006';

-- Crear PaymentEvent OVERDUE
INSERT INTO payment_events (id, "caseId", status, amount, "createdAt")
VALUES (gen_random_uuid(), '<case_id>', 'OVERDUE', 75000, NOW());
```

Disparar el worker:

```bash
# Encola un health-sweep manual (vía Bull Board o script)
# Esperado tras una vuelta:
#   unpaid_months = 1
#   stage = IN_PROGRESS  (NO se detiene)
#   audit_log: EMAIL_SENT "Mora Mes 1: Alerta enviada"
#   queue:    non_payment_warning (whatsapp + email)
```

### 5.2 Forzar Mes 2

```sql
UPDATE cases
SET unpaid_months = 1,
    last_health_check_at = NOW() - INTERVAL '31 days'
WHERE code = 'AT-TEST-006';
```

Tras la siguiente pasada del worker:
- `unpaid_months = 2`, `stage = IN_PROGRESS`, encola `overdue_notice`.

### 5.3 Forzar Mes 3 (HALT)

```sql
UPDATE cases
SET unpaid_months = 2,
    last_health_check_at = NOW() - INTERVAL '31 days'
WHERE code = 'AT-TEST-006';
```

Esperado:
- `stage = HALTED_BY_PAYMENT`, `halted_reason = "Mora Mes 3: Cuenta del cliente cancelada por impago sostenido."`
- `users.active = false` para el cliente del caso → al intentar login devuelve credenciales inválidas.
- Audit `CASE_HALTED`.
- `HaltedOverlay` visible para el abogado en `/admin/casos/[id]`.

```sql
-- Verificación
SELECT c.code, c.stage, c.unpaid_months, u.active AS client_active
FROM cases c JOIN users u ON u.id = c.client_id
WHERE c.code = 'AT-TEST-006';
```

---

## 6. Prueba del Paso 4 — Reactivación

### 6.1 Vía SuperAdmin (manual desde `/admin/mora`)

1. Login `jorge@atinforma.cl`.
2. Ir a `/admin/mora` → buscar el caso HALTED.
3. Click **"Regularizar pago"** (server action `regularizeCase`).
4. Internamente llama `reactivateCaseIfPaid`:
   - Si el caso tenía abogados asignados → vuelve a **`IN_PROGRESS`**.
   - Si no tenía → vuelve a **`OPEN`** (re-entra al Double Check).
   - `users.active = true` (cuenta cliente reactivada).
   - Encola `payment_receipt`.
   - Audit `CASE_REACTIVATED`.

### 6.2 Verificación SQL

```sql
SELECT c.code, c.stage, c.is_paid, c.unpaid_months, u.active
FROM cases c JOIN users u ON u.id = c.client_id
WHERE c.code = 'AT-TEST-006';
-- stage = IN_PROGRESS o OPEN
-- is_paid = true, unpaid_months = 0
-- u.active = true
```

### 6.3 Vía evento de pago interno

```ts
import { recordPaymentEvent } from "@/lib/payments";
import { PaymentStatus } from "@prisma/client";

await recordPaymentEvent({
  caseId: "<UUID>",
  status: PaymentStatus.PAID,
  amount: 75000,
  receiptUrl: "https://flow.cl/comprobante/regul-001",
});
// PAID/RESTORED → reactivateCaseIfPaid en la misma transacción.
```

---

## 7. Fixtures pre-sembradas (`prisma/seed-test-cases.ts`)

Tras `npx ts-node prisma/seed-test-cases.ts` queda este set listo para pruebas:

| Código | Cliente | Stage | is_paid | Categoría | Uso recomendado |
|---|---|---|---|---|---|
| AT-TEST-001 | Carlos Pérez | IN_PROGRESS | true  | TRIBUTARIO | Flujo normal |
| AT-TEST-004 | Carlos Pérez | OPEN        | true  | PENAL      | Probar Double Check |
| AT-TEST-005 | Carlos Pérez | FINISHED    | true  | CIVIL      | Read-only |
| AT-TEST-002 | Juan Pérez   | HALTED_BY_PAYMENT | false | LABORAL | Probar reactivación |
| AT-TEST-006 | Juan Pérez   | IN_PROGRESS | false | FAMILIA    | Probar escalamiento 3 meses |
| AT-TEST-003 | Ana López    | WAITING_CUOTAS | true | CIVIL    | Probar Sistema de Cuotas |
| AT-TEST-007 | Ana López    | OPEN        | true  | MIGRATORIO | Double Check |
| AT-TEST-008 | Pedro Nuevo  | OPEN        | true  | TRIBUTARIO | Asignación auto / power |
| AT-TEST-009 | Pedro Nuevo  | IN_PROGRESS | true  | LABORAL    | Reasignación |
| AT-TEST-101..103 | María Multiple | mix | mix | mix    | Cliente con múltiples casos |

Password de todos los usuarios sembrados: `Test2026!`.

---

## 8. Credenciales del seed base (`prisma/seed.ts`)

| Rol | Email | Password |
|---|---|---|
| SUPER_ADMIN     | jorge@atinforma.cl    | Admin2026!   |
| JEFE_DE_MESA    | jefe@atinforma.cl     | Jefe2026!    |
| ABOGADO         | abogado@atinforma.cl  | Abogado2026! |
| CLIENTE         | cliente@gmail.com     | Cliente2026! |
| SISTEMA_CUOTAS  | cuotas@atinforma.cl   | System2026!  |

---

## 9. Limpieza (sólo entornos de prueba)

```sql
-- Casos de prueba
DELETE FROM payment_events WHERE "caseId" IN (SELECT id FROM cases WHERE code LIKE 'AT-TEST-%');
DELETE FROM updates        WHERE "caseId" IN (SELECT id FROM cases WHERE code LIKE 'AT-TEST-%');
DELETE FROM comments       WHERE "caseId" IN (SELECT id FROM cases WHERE code LIKE 'AT-TEST-%');
DELETE FROM audit_logs     WHERE "caseId" IN (SELECT id FROM cases WHERE code LIKE 'AT-TEST-%');
DELETE FROM cases WHERE code LIKE 'AT-TEST-%' OR code LIKE 'AT-CRM-%';

-- Usuarios de prueba
DELETE FROM users WHERE email LIKE '%@test.cl';
```

---

## 10. Checklist de cumplimiento del embudo

Antes de declarar "carga masiva lista para producción":

- [ ] `/api/webhooks/crm` rechaza requests sin `x-webhook-signature` válido.
- [ ] Lead nuevo crea User + Case + envía credenciales WhatsApp + Email.
- [ ] `Case.initial_invoice` se popula con la URL del comprobante.
- [ ] `OPEN → IN_PROGRESS` requiere asignación explícita de abogado por Jefe de Mesa.
- [ ] Casos sin `is_paid` no pueden derivarse ni asignarse.
- [ ] Mes 1 mora: aviso, sigue trabajando.
- [ ] Mes 2 mora: aviso intensificado, sigue trabajando.
- [ ] Mes 3 mora: HALT + `User.active = false` + audit `CASE_HALTED`.
- [ ] Regularización vuelve al nodo de validación (OPEN o IN_PROGRESS si ya hay abogados).
- [ ] Cliente vuelve a poder loguear tras regularización.
- [ ] Todos los pasos generan entradas en `audit_logs`.

---

*Última actualización: 2026-04-30 — alineado con `prisma/schema.prisma` v3.0 y la spec del embudo.*
