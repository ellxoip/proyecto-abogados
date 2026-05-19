# Revision agil y tecnica - Proyecto Abogados

Fecha: 2026-05-18  
Enfoque: Scrum liviano + vibe coding con Claude y Codex  
Objetivo: detectar bloqueadores de produccion, deuda critica y ajuste de backlog.

## 1. Cambios relevantes desde la revision anterior

- La estructura ahora quedo directamente en la raiz del workspace:
  - `NEXIO`
  - `hive-service-control`
  - `hive-financial-control`
  - `pagaCuotas`
- Hay repos Git dentro de:
  - `hive-service-control`
  - `pagaCuotas`
- `hive-financial-control` muestra bastante mas cobertura de tests en `src/server/services/__tests__` y rutas de integracion.
- `hive-service-control` tiene un cambio local en `src/lib/case-warnings.ts` para usar `withSystemRls`.
- `hive-service-control` tiene logs dev sin trackear: `dev.err.log`, `dev.out.log`.
- Los paquetes Node principales no tienen `node_modules` instalados en raiz, por lo que las validaciones fallan antes de probar codigo.

## 2. Hallazgos priorizados

### P0 - Bloqueadores de produccion

| ID | Hallazgo | Evidencia | Impacto | Recomendacion |
| --- | --- | --- | --- | --- |
| F-001 | `pagaCuotas/README.md` tiene conflicto Git commiteado | `pagaCuotas/README.md:1`, `:108`, `:111` | Repo limpio pero documentacion rota; senal de merge incompleto | Resolver conflicto y dejar README productivo unico |
| F-002 | Endpoint interno de payment attempts no autentica request | `hive-financial-control/src/app/api/integrations/pagacuotas/payment-attempts/route.ts:4-8` | Cualquier caller podria registrar intentos de pago si la ruta queda expuesta | Usar `assertInternalApiAuth(request)` antes de leer payload |
| F-003 | Webhook Flow en AT INFORMA registra pago con mock | `hive-service-control/src/app/api/webhooks/flow/route.ts:21-44` | Puede crear eventos PAID falsos o inconsistentes | Eliminar ruta o delegar todo pago real a PagaCuotas |
| F-004 | Webhook Webpay en AT INFORMA registra pago con mock | `hive-service-control/src/app/api/webhooks/webpay/route.ts:22-57` | Puede crear eventos PAID falsos o duplicar flujo de pago | Eliminar mock; si se conserva, confirmar con SDK real |
| F-005 | Vercel programa crons que no existen | `hive-service-control/vercel.json:4`, `:8`, `:20` | Jobs 404; ademas `case-warnings` existe pero no esta programado | Reemplazar por rutas existentes o implementar endpoints |
| F-006 | NEXIO aun no esta endurecido para produccion | `NEXIO/backend/app/main.py:32`, `auth.py:15-22`, `database.py:9` | CORS abierto, SECRET_KEY temporal, SQLite por defecto | Exigir env productivo, CORS allowlist y Postgres |

### P1 - Riesgos altos de delivery

| ID | Hallazgo | Evidencia | Impacto | Recomendacion |
| --- | --- | --- | --- | --- |
| F-007 | Validaciones automatizadas no corren por dependencias ausentes | `npm.cmd test` falla por `vitest` no reconocido; `tsc` no reconocido | No hay evidencia CI local | Instalar dependencias o levantar CI reproducible |
| F-008 | `hive-service-control` deja logs dev sin ignorar | `git status --short` muestra `?? dev.err.log`, `?? dev.out.log` | Ruido de repo y riesgo de commitear trazas | Agregar `*.log` o archivos dev a `.gitignore` |
| F-009 | PagaCuotas esta limpio en Git pero README roto | `git status --short` limpio + conflicto en README | El conflicto ya esta dentro del commit actual | Tratar como deuda heredada, no como merge pendiente |
| F-010 | Hay `.env` real en `hive-financial-control` | archivo local detectado | Riesgo de secretos si se copia o sube accidentalmente | Confirmar `.gitignore`, rotar secretos si se compartieron |

### P2 - Deuda/documentacion

| ID | Hallazgo | Impacto | Recomendacion |
| --- | --- | --- | --- |
| F-011 | Documentacion de arranque todavia mezcla localhost, db push y supuestos de desarrollo | Onboarding confuso para nuevos operadores IA/humanos | Crear `RUNBOOK_PRODUCCION.md` por sistema |
| F-012 | Hay doble camino conceptual de pagos: AT webhooks y PagaCuotas providers | Aumenta riesgo de doble fuente de verdad | Definir PagaCuotas como unico bounded context de pagos |

## 3. Lectura agil actual

El proyecto no esta lejos de un MVP productivo, pero el cuello de botella no es "hacer mas pantallas". El cuello de botella esta en seguridad, integracion, evidencia y release discipline.

La mejor forma de avanzar con vibe coding es separar historias en slices muy pequenos:

1. Claude refina historia, criterio de aceptacion y casos borde.
2. Codex inspecciona repo e implementa el parche minimo.
3. Codex ejecuta validaciones disponibles.
4. Humano revisa diff y decide merge.
5. Se actualiza backlog/DoD si aparece deuda nueva.

## 4. Sprint 0 recomendado

Duracion: 3 a 5 dias.

| Prioridad | Historia tecnica | Salida esperada |
| --- | --- | --- |
| P0 | Resolver conflicto de `pagaCuotas/README.md` | README sin marcadores de merge |
| P0 | Proteger `payment-attempts` en SIS.CONTABLE | Endpoint rechaza requests sin api key/bearer |
| P0 | Decidir owner unico de pagos | AT no registra pagos mock; PagaCuotas concentra proveedores |
| P0 | Corregir `vercel.json` de AT | Solo crons existentes y protegidos |
| P0 | Preparar entorno de validacion | `npm install`/CI por modulo o pipeline remoto |
| P1 | Limpiar logs y `.gitignore` | Repos sin ruido local |

## 5. Definition of Done reforzada para vibe coding

Una historia no se considera lista aunque "funcione visualmente" si falta:

- diff revisado por humano;
- prueba o verificacion reproducible;
- validacion de seguridad/autenticacion;
- variables de entorno documentadas;
- migracion versionada si toca datos;
- decision explicita de rollback si toca pagos, DTE o jobs;
- evidencia en la historia: comando ejecutado, resultado y riesgo residual.

## 6. Recomendacion ejecutiva

Mantener la Gantt de produccion, pero mover el foco del Sprint 0/Sprint 1 a hardening:

1. Seguridad de endpoints internos.
2. Unificacion del flujo de pagos.
3. Crons reales.
4. CI/validaciones.
5. Secretos y ambientes.

Con Claude y Codex se puede avanzar muy rapido, pero este proyecto ya esta en la etapa donde "velocidad sin control" se convierte en riesgo de produccion. La IA debe usarse como acelerador con checklist, no como excusa para saltarse el cierre tecnico.

