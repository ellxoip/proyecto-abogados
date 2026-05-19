# INFORME_VISTAS_Y_FUNCIONES

Fecha: 2026-05-07  
Proyecto: `legal-finance-mvp`  
Alcance: análisis completo de frontend, APIs, servicios, Prisma, tests, variables de entorno e integraciones.

## 0. Metodología y fuentes

Revisión directa de código y ejecución de calidad:

- `src/app/**` (vistas, layout, sidebar, route handlers API).
- `src/server/**` (servicios de dominio, integraciones, auth).
- `prisma/schema.prisma` + migraciones `prisma/migrations/**`.
- `src/**/__tests__` y `*.test.ts`.
- `.env.example` y `.env` local.
- `README.md`, `startup.md`, `docs/importador-clientes-*.md`.
- Ejecución real:
  - `npm test` -> 15 archivos / 94 tests OK.
  - `npm run lint` -> OK.
  - `npm run build` -> OK (con warning deprecado de `middleware`).

---

## 1. Resumen general del sistema

### Qué problema resuelve

El sistema funciona como núcleo financiero/contable interno (SIS.CONTABLE) para:

- administrar clientes y contratos;
- controlar cuotas (saldos, vencimientos, estados);
- registrar y aplicar pagos;
- soportar cobranza operativa y reportes;
- integrarse con PagaCuotas (pasarela de cobro) y AT-INFORMA (sincronización externa).

### Módulos principales existentes

- Autenticación interna por sesión JWT (`lf_session`).
- Dashboard financiero.
- Clientes y ficha de cliente.
- Deudores y bandeja de cobros.
- Cuotas por cliente y detalle por contrato.
- Pagos recibidos.
- Reportes financieros + exportación CSV.
- Importador masivo de clientes/contratos/cuotas con preview/confirmación.
- Integraciones:
  - PagaCuotas (consultas de deuda, validación, eventos de pago).
  - AT-INFORMA (sync de clientes, plan de pagos y cobranza).

### Flujo general de usuario

1. Usuario inicia sesión en `/login`.
2. Navega a Dashboard o módulos operativos (`/clientes`, `/cuotas`, `/cobros-cuotas/cobros`, `/reportes`).
3. Puede importar datos desde `/admin/importaciones/clientes`.
4. Revisa deuda/cuotas/pagos y reportes.
5. Integraciones de pago y sync se ejecutan por endpoints internos/API o botón de sincronización.

---

## 2. Mapa actual de navegación/sidebar

Fuente: `src/app/components/app-shell.tsx`.

| Módulo / vista sidebar | Ruta | Estado | Datos que muestra | Acciones | Componentes principales | APIs / servicios | Modelos BD |
|---|---|---|---|---|---|---|---|
| Dashboard | `/dashboard` | Implementada (con detalle parcial de sync) | KPIs de pagos, CxC, morosidad, contratos, proyección | Sincronizar AT-INFORMA | `AtInformaSyncButton` | Prisma directo + `POST /api/internal/sync/at-informa` | `Pago`, `Cuota`, `Cliente`, `Contrato`, `ExternalSyncLog` |
| Clientes > Clientes | `/clientes` | Implementada | Listado de clientes, filtros, cantidad de contratos | Filtrar, limpiar, ver ficha | tabla server-rendered | Prisma directo | `Cliente`, `Contrato` |
| Clientes > Deudores | `/clientes/deudores` | Parcial | Resumen de deuda/cobranza por cliente | Filtrar, ver cliente/cuotas | tablas + badges | `getDeudoresOverview` | `Cliente`, `Contrato`, `Cuota`, `Pago`, `ModificacionContrato` |
| Clientes > Importar | `/admin/importaciones/clientes` | Implementada (avanzada) | Preview por estado READY/REVIEW/ERROR/SKIPPED | Subir XLSX, previsualizar, confirmar, exportar errores, descargar reporte final | `page-helpers` + tablas por tabs | `/api/importaciones/clientes/*` + `ClientImportService` | `ClientImportBatch`, `ClientImportItem`, `ContractImportItem`, `InstallmentImportItem`, entidades finales |
| Cobros y Cuotas > Cobros | `/cobros-cuotas/cobros` | Parcial | Bandeja de cobros por cliente/cuota, KPIs de cobranza | Filtrar, ver cuota, ir historial | agrupación por cliente | `getCobrosOverview` | `Cuota`, `Contrato`, `Cliente`, `Pago`, `ModificacionContrato` |
| Cobros y Cuotas > Cuotas | `/cuotas` | Implementada | Vista agrupada cliente -> contratos -> estado financiero | Expandir detalle, ver contrato | tabla expandible | `getCuotasOverview` | `Cliente`, `Contrato`, `Cuota`, `Pago` |
| Cobros y Cuotas > Pagos | `/pagos` | Implementada (lectura) | Listado de pagos con cliente, contrato, cuota y medio | Solo consulta | tabla | Prisma directo | `Pago`, `Cliente`, `Contrato` |
| Reportes > Reportes (raíz) | `/reportes` | Implementada | 5 reportes (pagos, cxc, vencimientos, morosidad, proyección) | Filtrar y exportar CSV por tipo | tablas + links CSV | `reporting.ts` + `/api/reportes/[tipo]` | `Pago`, `Contrato`, `Cuota`, `Cliente` |
| Reportes > Historial | `/reportes/historial` | Implementada (parcial funcional) | Timeline operativo de eventos | Filtrar, paginar, ver cliente/contrato | tabla | `getCobrosHistorial` | `Cliente`, `Contrato`, `Cuota`, `Pago`, `ModificacionContrato`, `IntegrationEvent`, `ClientImportBatch` |
| Cobros y Cuotas > Historial (legacy) | `/cobros-cuotas/historial` | Mock/legacy (redirect) | No contenido propio | Redirige | redirect page | N/A | N/A |
| Cobranza > Pendientes | No encontrada | Pendiente | N/A | N/A | item sin `href` | N/A | N/A |
| Cobranza > Vencidas | No encontrada | Pendiente | N/A | N/A | item sin `href` | N/A | N/A |
| Cobranza > Compromisos | No encontrada | Pendiente | N/A | N/A | item sin `href` | N/A | N/A |
| Cobranza > Gestiones | No encontrada | Pendiente | N/A | N/A | item sin `href` | N/A | N/A |
| Tesorería > Bancos | No encontrada | Pendiente | N/A | N/A | item sin `href` | N/A | N/A |
| Tesorería > Movimientos | No encontrada | Pendiente | N/A | N/A | item sin `href` | N/A | N/A |
| Tesorería > Pagos recibidos | No encontrada | Pendiente (duplica `/pagos`) | N/A | N/A | item sin `href` | N/A | N/A |
| Reportes > Deuda por cliente | No encontrada como vista separada | Parcial (embebida en `/reportes`) | Sí, como sección de CxC | Export CSV | sección en `/reportes` | `reportCuentasPorCobrar` | `Contrato`, `Cuota`, `Pago`, `Cliente` |
| Reportes > Cuotas vencidas | No encontrada como vista separada | Parcial (embebida en `/reportes`) | Sí, sección vencimientos | Export CSV | sección en `/reportes` | `reportVencimientos` | `Cuota`, `Contrato`, `Cliente` |
| Reportes > Pagos recibidos | No encontrada como vista separada | Parcial (embebida en `/reportes`) | Sí, sección pagos | Export CSV | sección en `/reportes` | `reportPagosRecibidos` | `Pago`, `Contrato`, `Cliente` |
| Reportes > Compromisos incumplidos | No encontrada | Pendiente | N/A | N/A | item sin `href` | N/A | N/A |
| Configuración > Empresa | No encontrada | Pendiente | N/A | N/A | item sin `href` | N/A | N/A |
| Configuración > Usuarios | No encontrada | Pendiente | N/A | N/A | item sin `href` | N/A | N/A |
| Configuración > Permisos | No encontrada | Pendiente | N/A | N/A | item sin `href` | N/A | N/A |
| Configuración > Parámetros | No encontrada | Pendiente | N/A | N/A | item sin `href` | N/A | N/A |

---

## 3. Informe por módulo (detalle por vista)

### Dashboard

#### Dashboard Financiero

- Ruta: `/dashboard`
- Propósito: visualizar salud financiera general y disparar sync AT-INFORMA.
- Funciones implementadas:
  - KPIs mensuales y de cartera.
  - botón de sincronización AT-INFORMA.
- Datos que muestra:
  - ingresos mes, CxC total, cuotas vencidas, clientes morosos, contratos activos, nuevos contratos, proyección y recaudación real/esperada.
- Filtros/búsquedas disponibles: no.
- Acciones disponibles: sincronizar AT-INFORMA.
- Estados manejados:
  - en botón: loading/success/error.
- Validaciones:
  - backend valida payload con `zod` en sync route.
- APIs usadas:
  - `POST /api/internal/sync/at-informa`.
- Servicios usados:
  - Prisma directo en page.
  - `AtInformaSyncService.syncAll`.
- Modelos/tablas relacionados:
  - `Pago`, `Cuota`, `Cliente`, `Contrato`, `ExternalSyncLog`.
- Tests relacionados:
  - tests de sync AT-INFORMA y cliente en `src/server/integrations/at-informa/__tests__/*`.
- Archivos principales:
  - `src/app/dashboard/page.tsx`
  - `src/app/components/at-informa-sync-button.tsx`
  - `src/app/api/internal/sync/at-informa/route.ts`
- Pendientes/recomendaciones:
  - ajustar contrato de respuesta del botón (UI espera estructura distinta a la API actual).
  - alinear variable `lastSync` con `AT_INFORMA_FULL_SYNC`.

### Clientes

#### Clientes

- Ruta: `/clientes`
- Propósito: base maestra de clientes.
- Funciones implementadas:
  - búsqueda por nombre/RUT/email.
  - filtros por tipo, estado y existencia de contratos.
  - acceso a ficha individual.
- Datos que muestra:
  - RUT, nombre, tipo, estado, fecha ingreso, número de contratos.
- Filtros/búsquedas disponibles: `q`, `tipo`, `estado`, `contratos`.
- Acciones disponibles: ver ficha.
- Estados manejados: `EstadoCliente`.
- Validaciones: filtros solo aplican enum válido.
- APIs usadas: no consume API REST; consulta server-side con Prisma.
- Servicios usados: ninguno (Prisma directo).
- Modelos/tablas relacionados: `Cliente`, `Contrato`.
- Tests relacionados: sin test específico de vista.
- Archivos principales:
  - `src/app/clientes/page.tsx`
- Pendientes/recomendaciones:
  - agregar paginación y test de filtros.

#### Deudores

- Ruta: `/clientes/deudores`
- Propósito: priorización de cobranza por cliente deudor.
- Funciones implementadas:
  - resumen global de riesgo.
  - filtros de monto/estado/atraso/compromiso.
  - links rápidos a cliente y cuotas.
- Datos que muestra:
  - deuda total, vencida, por vencer, atraso, último pago, próxima cuota, estado cobranza.
- Filtros/búsquedas disponibles: `q`, `estadoCobranza`, `minMonto`, `maxMonto`, `minDias`, `maxDias`, flags de compromiso/vencidas.
- Acciones disponibles:
  - ver cliente / ver cuotas.
  - botones de gestión y compromiso están deshabilitados.
- Estados manejados:
  - `SIN_GESTION`, `CONTACTADO`, `COMPROMISO_ACTIVO`, `COMPROMISO_INCUMPLIDO`, `MOROSO`, `CRITICO`.
- Validaciones: números parseados desde query params.
- APIs usadas: no (servicio server-side).
- Servicios usados: `getDeudoresOverview`.
- Modelos/tablas relacionados:
  - `Cliente`, `Contrato`, `Cuota`, `Pago`, `ModificacionContrato`.
- Tests relacionados:
  - `src/server/services/__tests__/cobranza.service.test.ts`
- Archivos principales:
  - `src/app/clientes/deudores/page.tsx`
  - `src/server/services/cobranza.service.ts`
- Pendientes/recomendaciones:
  - implementar acciones reales de gestión/compromiso.
  - separar “compromiso” de uso indirecto vía `REPACTADO`.

#### Importar clientes

- Ruta: `/admin/importaciones/clientes`
- Propósito: carga masiva con control de calidad en dos etapas.
- Funciones implementadas:
  - upload XLSX.
  - preview persistente en staging.
  - confirmación con política (`onlyReady` / `allowReview`).
  - export de errores TXT/CSV.
  - descarga reporte final batch.
- Datos que muestra:
  - métricas de estado por entidad (clientes, contratos, cuotas).
  - detalle de errores/warnings.
  - resultado final y registros para revisión manual.
- Filtros/búsquedas disponibles: tabs de resumen/listos/problemas.
- Acciones disponibles: previsualizar, confirmar, exportar, descargar reporte.
- Estados manejados:
  - preview: `READY`, `REVIEW`, `ERROR`, `SKIPPED`.
  - confirm: además `IMPORTED`.
  - batch: `PREVIEW_READY`, `PROCESSING`, `CONFIRMED`, `FAILED`.
- Validaciones:
  - extensión `.xlsx`.
  - normalización de headers, RUT, montos, fechas, estado, referencias cruzadas.
- APIs usadas:
  - `POST /api/importaciones/clientes/preview`
  - `POST /api/importaciones/clientes/[batchId]/confirm`
  - `GET /api/importaciones/clientes/[batchId]/reporte`
- Servicios usados:
  - `ClientImportService`.
- Modelos/tablas relacionados:
  - staging `ClientImport*`.
  - `Cliente`, `ClienteContacto`, `ClienteFacturacion`, `Contrato`, `Cuota`, `Pago`, `AplicacionPago`, `ExternalReference`.
- Tests relacionados:
  - `src/server/services/__tests__/client-import.service.test.ts`
  - `src/app/api/importaciones/clientes/[batchId]/confirm/route.test.ts`
  - `src/app/admin/importaciones/clientes/page-helpers.test.ts`
- Archivos principales:
  - `src/app/admin/importaciones/clientes/page.tsx`
  - `src/server/services/client-import.service.ts`
- Pendientes/recomendaciones:
  - riesgo de timeout por transacción por contrato (`timeout: 30000`).
  - formalizar reglas de pago histórico y reconciliación.

### Contratos y Cuotas

#### Contratos

- Ruta: No encontrada como vista dedicada (`/contratos` no existe).
- Propósito: N/A.
- Funciones implementadas: parcial vía `/cuotas` y `/clientes/[id]`.
- Datos que muestra: N/A como módulo propio.
- Filtros/búsquedas disponibles: N/A.
- Acciones disponibles: N/A.
- Estados manejados: `EstadoContrato` en vistas relacionadas.
- Validaciones: N/A.
- APIs usadas: No encontrada.
- Servicios usados: N/A.
- Modelos/tablas relacionados: `Contrato`, `Cuota`, `Pago`.
- Tests relacionados: servicios financieros sí tienen pruebas.
- Archivos principales:
  - `src/app/cuotas/page.tsx`, `src/app/clientes/[id]/page.tsx`
- Pendientes/recomendaciones:
  - crear vista dedicada de contratos con CRUD y trazabilidad.

#### Cuotas

- Ruta: `/cuotas`
- Propósito: vista consolidada por cliente y contrato.
- Funciones implementadas:
  - agrupación por cliente con detalle por contrato.
  - estados financieros derivados.
- Datos que muestra:
  - totales contratados, pagados, saldo, cuotas pagadas/pendientes/vencidas.
- Filtros/búsquedas disponibles: no.
- Acciones disponibles: ver detalle de contrato.
- Estados manejados:
  - UI `EstadoFinanciero`: `AL_DIA`, `CON_DEUDA`, `MOROSO`, `PAGADO`, `EN_REVISION`.
- Validaciones: N/A.
- APIs usadas: no (servicio directo).
- Servicios usados: `getCuotasOverview`.
- Modelos/tablas relacionados: `Cliente`, `Contrato`, `Cuota`, `Pago`.
- Tests relacionados:
  - `src/server/services/__tests__/cuotas.service.test.ts`
- Archivos principales:
  - `src/app/cuotas/page.tsx`
  - `src/server/services/cuotas.service.ts`
- Pendientes/recomendaciones:
  - agregar filtros por estado/cliente/servicio.

#### Detalle de cuotas por contrato

- Ruta: `/cuotas/[contratoId]`
- Propósito: detalle financiero y operacional del contrato.
- Funciones implementadas:
  - resumen financiero.
  - tabla de cuotas y estados.
  - muestra acciones disponibles por estado, pero deshabilitadas en UI.
- Datos que muestra:
  - contrato, cliente, métricas de cuotas, vencimientos y estado.
- Filtros/búsquedas disponibles: no.
- Acciones disponibles: solo visual (botones disabled).
- Estados manejados:
  - `CuotaUiEstado` y `EstadoFinanciero`.
- Validaciones:
  - `contratoId` numérico > 0, `404` si no existe.
- APIs usadas:
  - equivalente API: `GET /api/cuotas/[contratoId]`.
- Servicios usados:
  - `getContratoCuotasDetalle`.
- Modelos/tablas relacionados: `Contrato`, `Cliente`, `Cuota`, `Pago`.
- Tests relacionados:
  - `src/server/services/__tests__/cuotas.service.test.ts`.
- Archivos principales:
  - `src/app/cuotas/[contratoId]/page.tsx`
  - `src/app/api/cuotas/[contratoId]/route.ts`
- Pendientes/recomendaciones:
  - habilitar acciones operativas reales (pago, recordatorio, edición).

#### Cobros/Pagos (bandeja de cobros)

- Ruta: `/cobros-cuotas/cobros`
- Propósito: operación diaria de cobro.
- Funciones implementadas:
  - filtros de cobro y agrupación por cliente.
  - KPIs de vencido/proximidad/compromisos.
- Datos que muestra:
  - cuotas cobrables, atraso, estado cobranza y señales de revisión.
- Filtros/búsquedas disponibles:
  - `q`, `estadoCuota`, `estadoCobranza`, `minMonto`, `maxMonto`, flags.
- Acciones disponibles:
  - ver cuota / ir historial.
  - registrar pago y registrar gestión aún disabled.
- Estados manejados:
  - `EstadoCobranza` derivado.
  - estados de cuota operativos.
- Validaciones:
  - parse de números/fechas desde query.
- APIs usadas:
  - equivalente API: `GET /api/cobros-cuotas/cobros`.
- Servicios usados:
  - `getCobrosOverview`.
- Modelos/tablas relacionados:
  - `Cuota`, `Contrato`, `Cliente`, `Pago`, `ModificacionContrato`.
- Tests relacionados:
  - `src/server/services/__tests__/cobranza.service.test.ts`.
- Archivos principales:
  - `src/app/cobros-cuotas/cobros/page.tsx`
  - `src/server/services/cobranza.service.ts`
- Pendientes/recomendaciones:
  - activar acciones transaccionales de cobro y gestión.

#### Historial

- Ruta principal: `/reportes/historial`  
  Ruta legacy: `/cobros-cuotas/historial` (redirect).
- Propósito: trazabilidad operativa e integración.
- Funciones implementadas:
  - timeline consolidado de eventos (clientes, contratos, cuotas, pagos, importaciones, integración).
  - filtros y paginación.
- Datos que muestra:
  - tipo evento, entidad, origen, estado, monto, referencias.
- Filtros/búsquedas disponibles:
  - `q`, `tipoEvento`, `entidad`, `usuario`, `origen`, rango fecha, flags por tipo.
- Acciones disponibles:
  - ver cliente / ver contrato.
  - ver raw data aún disabled.
- Estados manejados:
  - múltiples estados derivados por evento.
- Validaciones:
  - page y pageSize acotados.
- APIs usadas:
  - equivalente API: `GET /api/cobros-cuotas/historial`.
- Servicios usados:
  - `getCobrosHistorial`.
- Modelos/tablas relacionados:
  - `Cliente`, `Contrato`, `Cuota`, `Pago`, `ModificacionContrato`, `IntegrationEvent`, `ClientImportBatch`.
- Tests relacionados:
  - no hay test específico de vista/ruta historial.
- Archivos principales:
  - `src/app/reportes/historial/page.tsx`
  - `src/server/services/cobranza.service.ts`
- Pendientes/recomendaciones:
  - agregar “ver detalle raw” y test dedicado.

### Cobranza (módulo dedicado)

#### Pendientes

- Ruta: No encontrada.
- Propósito: pendiente.
- Funciones implementadas: no.
- Datos/Filtros/Acciones/Estados/Validaciones/APIs/Servicios/Tests: No encontrado.
- Archivos principales:
  - `src/app/components/app-shell.tsx` (placeholder sin `href`).
- Pendientes/recomendaciones:
  - separar vista desde `getCobrosOverview` con filtro fijo pendientes.

#### Vencidas

- Ruta: No encontrada.
- Estado: pendiente.
- Observación:
  - hoy se cubre parcialmente con filtros en `/cobros-cuotas/cobros`.

#### Compromisos

- Ruta: No encontrada.
- Estado: pendiente.
- Observación:
  - lógica actual infiere “compromiso” usando contratos `REPACTADO`, no hay entidad explícita.

#### Gestiones

- Ruta: No encontrada.
- Estado: pendiente.
- Observación:
  - se reutiliza `ModificacionContrato` como pseudo-historial de gestión.

### Tesorería básica

#### Bancos

- Ruta: No encontrada.
- Estado: pendiente.
- Modelos BD: no existe modelo Banco/Cuenta bancaria.

#### Movimientos

- Ruta: No encontrada.
- Estado: pendiente.
- Modelos BD: no existe modelo MovimientoTesoreria.

#### Pagos recibidos (tesorería)

- Ruta: No encontrada como submódulo de tesorería.
- Estado: pendiente/parcial.
- Observación:
  - existe `/pagos` como vista de pagos global.

### Reportes

#### Deuda por cliente

- Ruta: No encontrada separada.
- Estado: parcial.
- Implementación actual:
  - sección “Cuentas por cobrar” dentro de `/reportes`.

#### Cuotas vencidas

- Ruta: No encontrada separada.
- Estado: parcial.
- Implementación actual:
  - sección “Vencimientos” dentro de `/reportes`.

#### Pagos recibidos

- Ruta: No encontrada separada.
- Estado: parcial.
- Implementación actual:
  - sección “Pagos recibidos” dentro de `/reportes`.

#### Compromisos incumplidos

- Ruta: No encontrada.
- Estado: pendiente.

### Configuración

#### Empresa

- Ruta: No encontrada.
- Estado: pendiente.

#### Usuarios

- Ruta: No encontrada.
- Estado: pendiente (solo modelo `Usuario` + login seed).

#### Permisos

- Ruta: No encontrada.
- Estado: pendiente (solo `RolUsuario` básico).

#### Parámetros

- Ruta: No encontrada.
- Estado: pendiente.

---

## 4. APIs implementadas

Total endpoints detectados: 21 (método + ruta).

### 4.1 APIs de clientes

#### `GET /api/clientes/deudores`

- Tipo: Privada interna (sesión vía middleware).
- Para qué sirve: devuelve resumen de deudores y KPIs de cobranza.
- Parámetros query: `q`, `estadoCobranza`, `vencidas`, `minMonto`, `maxMonto`, `minDias`, `maxDias`, `compromisoActivo`, `compromisoIncumplido`.
- Payload esperado: N/A.
- Respuesta: `{ data, summary }`.
- Validaciones: parse de números/flags, errores 500 genéricos si falla servicio.
- Servicio: `getDeudoresOverview`.
- Modelo BD: `Cliente`, `Contrato`, `Cuota`, `Pago`, `ModificacionContrato`.
- Tests: cobertura indirecta por `cobranza.service.test.ts`.
- Seguridad: depende de middleware; no guard de rol.

### 4.2 APIs de importación

#### `POST /api/importaciones/clientes/preview`

- Tipo: Privada interna (requiere sesión explícita con `requireSessionUser`).
- Para qué sirve: valida archivo, genera preview y guarda staging.
- Parámetros: multipart form con `file`.
- Payload esperado: archivo `.xlsx`.
- Respuesta: `{ ok: true, batchId, summary, preview }`.
- Validaciones:
  - `file` obligatorio.
  - extensión `.xlsx`.
- Servicio: `ClientImportService.previewImport`.
- Modelo BD:
  - `ClientImportBatch`, `ClientImportItem`, `ContractImportItem`, `InstallmentImportItem`.
- Tests: cobertura amplia en `client-import.service.test.ts`.
- Seguridad: session guard correcto.

#### `POST /api/importaciones/clientes/[batchId]/confirm`

- Tipo: Privada interna (sesión).
- Para qué sirve: confirma importación del batch.
- Parámetros:
  - path `batchId`.
  - body opcional `{ onlyReady?, allowReview?, skipNonReady? }`.
- Payload esperado: JSON opcional de política.
- Respuesta: `{ ok: true, batchId, report }`.
- Validaciones:
  - `batchId` entero positivo.
  - mapea `skipNonReady` como alias de `onlyReady`.
- Servicio: `ClientImportService.confirmImport`.
- Modelo BD: staging + entidades finales (`Cliente`, `Contrato`, `Cuota`, etc.).
- Tests:
  - `route.test.ts` para flags.
  - tests extensivos del servicio.
- Seguridad: session guard correcto.

#### `GET /api/importaciones/clientes/[batchId]/reporte`

- Tipo: Privada interna (sesión).
- Para qué sirve: descarga reporte JSON del batch.
- Parámetros: `batchId`.
- Respuesta: archivo JSON (`Content-Disposition` attachment).
- Validaciones: `batchId` entero positivo.
- Servicio: `ClientImportService.getBatchReport`.
- Modelo BD: tablas `ClientImport*`.
- Tests: cobertura indirecta.
- Seguridad: session guard correcto.

### 4.3 APIs de contratos

No existe endpoint REST dedicado tipo `/api/contratos` para CRUD interno.  
Contratos se consumen vía:

- `/api/cuotas/[contratoId]` (detalle por contrato).
- endpoints de integración PagaCuotas/portal.
- importador.

### 4.4 APIs de cuotas

#### `GET /api/cuotas`

- Tipo: Privada (sesión middleware).
- Para qué sirve: overview de cuotas por cliente/contrato.
- Respuesta: `CuotasOverviewResponse`.
- Servicio: `getCuotasOverview`.
- Modelo BD: `Cliente`, `Contrato`, `Cuota`, `Pago`.
- Tests: `cuotas.service.test.ts`.
- Seguridad: sin control de rol.

#### `GET /api/cuotas/[contratoId]`

- Tipo: Privada.
- Para qué sirve: detalle de contrato y cuotas.
- Parámetros: `contratoId`.
- Respuesta: `ContratoDetalleResponse` o `404`.
- Validaciones: `contratoId` numérico > 0.
- Servicio: `getContratoCuotasDetalle`.
- Modelo BD: `Contrato`, `Cuota`, `Pago`, `Cliente`.
- Tests: cobertura indirecta.
- Seguridad: sin control de rol.

### 4.5 APIs de pagos/cobros

#### `GET /api/cobros-cuotas/cobros`

- Tipo: Privada.
- Para qué sirve: bandeja de cobros y KPIs.
- Query: `q`, `estadoCuota`, `estadoCobranza`, `vencidas`, `proximas`, `compromisoActivo`, `sinGestion`, `minMonto`, `maxMonto`, `desde`, `hasta`.
- Respuesta: `{ data, summary }`.
- Servicio: `getCobrosOverview`.
- Modelo BD: `Cuota`, `Contrato`, `Cliente`, `Pago`, `ModificacionContrato`.
- Tests: cobertura indirecta servicio.
- Seguridad: sin rol.

#### `GET /api/cobros-cuotas/historial`

- Tipo: Privada.
- Para qué sirve: timeline de eventos.
- Query: múltiples filtros + `page`, `pageSize`.
- Respuesta: `{ data, pagination }`.
- Servicio: `getCobrosHistorial`.
- Modelo BD:
  - `Cliente`, `Contrato`, `Cuota`, `Pago`, `ModificacionContrato`, `IntegrationEvent`, `ClientImportBatch`.
- Tests: no hay test específico de endpoint.
- Seguridad: sin rol.

### 4.6 APIs de cobranza

No hay endpoints específicos `/api/cobranza/*` por submódulo (pendientes, vencidas, compromisos, gestiones).  
La lógica de cobranza está concentrada en:

- `GET /api/clientes/deudores`
- `GET /api/cobros-cuotas/cobros`
- `GET /api/cobros-cuotas/historial`

### 4.7 APIs de reportes

#### `GET /api/reportes/[tipo]`

- Tipo: Privada (sesión).
- Para qué sirve: entrega reportes JSON o CSV.
- Parámetros:
  - path `tipo`: `pagos`, `cxc`, `vencimientos`, `morosidad`, `proyeccion`.
  - query: `from`, `to`, `estado`, `servicio`, `cliente`, `format=csv`.
- Respuesta:
  - JSON `{ rows }` o CSV descargable.
- Validaciones:
  - tipo soportado, parse de filtros/fechas.
- Servicios:
  - `reportPagosRecibidos`, `reportCuentasPorCobrar`, `reportVencimientos`, `reportMorosidad`, `reportProyeccionCaja`.
- Modelo BD: `Pago`, `Contrato`, `Cuota`, `Cliente`.
- Tests: sin pruebas directas del endpoint.
- Seguridad: sin rol.

### 4.8 APIs internas para PagaCuotas / SIS.CONTABLE

#### `GET /api/integrations/pagacuotas/deudas/[identifier]`

- Tipo: Interna (API key/Bearer + sesión middleware).
- Para qué sirve: resumen de deuda de cliente para PagaCuotas.
- Parámetros: `identifier` (RUT, external id de referencia o id numérico).
- Respuesta: cliente + resumen deuda + contratos activos.
- Servicio: `PaymentPortalService.getInternalDeudaSummary`.
- Modelos: `Cliente`, `Contrato`, `Cuota`, `ExternalReference`.
- Tests: cobertura indirecta `payment-portal.service.test.ts`.
- Seguridad: `assertInternalApiAuth` correcto.

#### `GET /api/integrations/pagacuotas/contratos/[contratoId]/cuotas`

- Tipo: Interna (API key/Bearer + sesión middleware).
- Para qué sirve: listar cuotas pagables de contrato.
- Parámetros: `contratoId` (interno o external id).
- Respuesta: `{ contrato_id, cuotas[] }`.
- Servicio: `PaymentPortalService.getInternalContractInstallments`.
- Modelos: `Contrato`, `Cuota`, `ExternalReference`.
- Tests: cobertura indirecta.
- Seguridad: `assertInternalApiAuth` correcto.

#### `POST /api/integrations/pagacuotas/payment-attempts`

- Tipo: Interna por diseño, pero sin guard explícito de API key en route.
- Para qué sirve: registrar intento de pago e idempotencia.
- Payload esperado:
  - `external_attempt_id`, `cliente_id`, `contrato_id`, `monto`, opcional `cuota_ids`, etc.
- Respuesta: estado `registered` o `idempotent`.
- Validaciones:
  - monto > 0, existencia de cliente/contrato/cuotas, pertenencia de cuotas.
- Servicio: `PagaCuotasIntegrationService.registerPaymentAttempt`.
- Modelos: `IntegrationEvent`, `Cliente`, `Contrato`, `Cuota`.
- Tests: `pagacuotas-integration.service.test.ts`.
- Observación seguridad:
  - falta `assertInternalApiAuth` en route (riesgo si middleware cambia o es bypassed).

#### `POST /api/integrations/pagacuotas/payment-intents/validate`

- Tipo: Interna (API key/Bearer).
- Para qué sirve: validar intención de pago.
- Payload esperado:
  - `external_attempt_id`, `cliente_id`, `contrato_id`, `cuota_ids[]`, `monto_total`.
- Respuesta:
  - `{ valid, errors[] }`, opcional `idempotent`.
- Validaciones:
  - cuotas deben estar en estados permitidos (`PENDIENTE`/`VENCIDA`) y monto exacto.
- Servicio: `validatePaymentIntent`.
- Modelos: `IntegrationEvent`, `Cliente`, `Contrato`, `Cuota`.
- Tests: route test + service test.
- Seguridad: correcta a nivel route.

#### `POST /api/integrations/pagacuotas/payments/confirmed`

- Tipo: Interna (API key/Bearer).
- Para qué sirve: confirmar pago, aplicar a cuotas y sincronizar AT-INFORMA.
- Payload esperado:
  - `identifier`, `amount/monto`, opcional `external_payment_id`, `contrato_id`, `cuota_ids`, referencias.
- Respuesta: `{ ok, integration_event_id, pago_id }` o idempotente.
- Validaciones:
  - cliente/contrato, monto > 0, resolución de cuotas, idempotencia.
- Servicio: `registerConfirmedPayment`.
- Modelos:
  - `IntegrationEvent`, `Pago`, `AplicacionPago`, `Cuota`, `Contrato`, `ExternalReference`.
- Tests: `pagacuotas-integration.service.test.ts`.
- Seguridad:
  - guard correcto.
  - depende de configuración AT-INFORMA para completar sync.

#### `POST /api/integrations/pagacuotas/payments/rejected`

- Tipo: Interna (API key/Bearer).
- Para qué sirve: registrar rechazo de pago.
- Payload esperado:
  - `external_payment_id` o `external_attempt_id` o `provider_transaction_id`.
- Respuesta: `registered`/`idempotent`.
- Validaciones: idempotencia y actualización de intento/pago si aplica.
- Servicio: `registerRejectedPayment`.
- Modelos: `IntegrationEvent`, `Pago`.
- Tests: `pagacuotas-integration.service.test.ts`.
- Seguridad: guard correcto.

#### `POST /api/integrations/pagacuotas/payments/reversed`

- Tipo: Interna (API key/Bearer).
- Para qué sirve: reversar pago aplicado.
- Payload esperado:
  - `external_reversal_id`, y referencia a pago original.
- Respuesta: `processed`, `idempotent` o `pending_review`.
- Validaciones:
  - idempotencia, búsqueda de pago original, límite de reversa.
- Servicio: `registerReversedPayment`.
- Modelos:
  - `IntegrationEvent`, `Pago`, `AplicacionPago`, `Cuota`, `Contrato`, `ExternalReference`.
- Tests: `pagacuotas-integration.service.test.ts`.
- Seguridad: guard correcto.

### 4.9 APIs públicas del portal de pagos

#### `GET /api/public/payment-portal/clientes/[identifier]/deudas`

- Tipo: Pública por ruta, pero actualmente alcanzada por middleware de sesión (ver riesgos).
- Para qué sirve: consulta pública de deudas por identificador.
- Parámetros: `identifier`.
- Respuesta: `{ ok, cliente, total_deuda, contratos[] }`.
- Servicio: `PaymentPortalService.getDeudasByIdentifier`.
- Modelos: `Cliente`, `Contrato`, `Cuota`, `ExternalReference`.
- Tests: cobertura indirecta de servicio.
- Seguridad:
  - sin API key propia.
  - hoy depende accidentalmente del middleware global.

#### `GET /api/public/payment-portal/contratos/[contratoId]/cuotas`

- Tipo: Pública por ruta, con misma observación de middleware.
- Para qué sirve: listar cuotas de contrato con campo `puede_pagar`.
- Parámetros: `contratoId` interno o externo.
- Respuesta: objeto contrato + cuotas.
- Servicio: `PaymentPortalService.getCuotasByContrato`.
- Modelos: `Contrato`, `Cuota`, `ExternalReference`.
- Tests:
  - route test 404.
  - tests de servicio.
- Seguridad: igual observación.

### 4.10 APIs de configuración

No se encontraron endpoints para:

- empresa,
- usuarios,
- permisos,
- parámetros.

---

## 5. Integración con PagaCuotas / portal de pagos

### Endpoints existentes para portal/pasarela

- Consulta deuda interna PagaCuotas:
  - `GET /api/integrations/pagacuotas/deudas/[identifier]`
- Consulta cuotas contrato para PagaCuotas:
  - `GET /api/integrations/pagacuotas/contratos/[contratoId]/cuotas`
- Validación previa:
  - `POST /api/integrations/pagacuotas/payment-intents/validate`
- Confirmación pago:
  - `POST /api/integrations/pagacuotas/payments/confirmed`
- Rechazo pago:
  - `POST /api/integrations/pagacuotas/payments/rejected`
- Reversa:
  - `POST /api/integrations/pagacuotas/payments/reversed`
- Registro de intento:
  - `POST /api/integrations/pagacuotas/payment-attempts`
- Endpoints “public portal”:
  - `GET /api/public/payment-portal/clientes/[identifier]/deudas`
  - `GET /api/public/payment-portal/contratos/[contratoId]/cuotas`

### Cómo se buscan deudas por RUT/email/id

Implementado en `PaymentPortalService`:

- primero por `rut` exacto;
- luego por `ExternalReference` (`entity_type=CLIENTE`, `external_id=identifier`);
- luego por `id` numérico.

No existe búsqueda directa por campo `Cliente.email`; el email puede funcionar solo si fue registrado como `external_id` en `ExternalReference` (por ejemplo vía integración externa).

### Cómo se listan contratos y cuotas

- Deudas por cliente:
  - filtra cuotas cobrables en estados `PENDIENTE`, `PARCIAL`, `VENCIDA`.
- Cuotas por contrato:
  - orden por número y vencimiento.
  - calcula `pagable/puede_pagar` con estado + `cobrable`.

### Cómo se valida un intento/intención de pago

- `validatePaymentIntent` exige:
  - `external_attempt_id`, `cliente_id`, `contrato_id`, `cuota_ids`, `monto_total`.
- Reglas:
  - cliente/contrato existentes y relacionados.
  - cuotas existen y pertenecen al contrato.
  - estados permitidos para validación: `PENDIENTE` o `VENCIDA`.
  - monto total debe coincidir exactamente con suma de saldos.

### Cómo se confirma un pago

`registerConfirmedPayment`:

1. idempotencia (`external_payment_id` o clave fallback).
2. resolución de cliente (identifier) y contrato.
3. crea `Pago` estado `CONFIRMADO` (medio `pagacuotas`).
4. crea/actualiza referencia externa de pago.
5. aplica pago a cuotas (`PaymentApplicationService.aplicarPagoACuotas`).
6. sincroniza a AT-INFORMA con payload construido.
7. marca `IntegrationEvent` como `PROCESSED`.

### Cómo se rechaza un pago

`registerRejectedPayment`:

- registra evento de rechazo idempotente;
- actualiza intento previo si existe;
- opcionalmente actualiza pago a estado `RECHAZADO` por external id;
- no aplica cuotas.

### Cómo se reversa un pago

`registerReversedPayment`:

- idempotencia por `external_reversal_id`;
- busca pago original;
- marca pago original `REVERSADO`;
- crea pago negativo y aplicaciones negativas;
- recalcula cuota/contrato;
- si no encuentra pago original -> `pending_review`.

### Reglas de idempotencia

Base transversal: `IntegrationEventService.ensureIdempotency`.

- clave única `idempotency_key`.
- respaldo por `(sistema, event_type, external_event_id)`.
- eventos duplicados procesados devuelven respuesta idempotente sin repetir efectos.

Casos:

- `payment-attempt`: `pagacuotas:payment-attempt:{external_attempt_id}` + chequeo `provider_transaction_id`.
- `payment-intents.validate`: por `external_attempt_id`.
- `payments.confirmed`: por `external_payment_id` o fallback derivado.
- `payments.rejected`: por `external_payment_id/external_attempt_id/provider_tx`.
- `payments.reversed`: por `external_reversal_id`.

### Estados de cuota/pago/contrato manejados

- Cuota: `PENDIENTE`, `PARCIAL`, `VENCIDA`, `PAGADA`, etc.
- Pago: `CONFIRMADO`, `RECHAZADO`, `REVERSADO`.
- Contrato: recalcula a `ACTIVO` / `EN_MORA` / `PAGADO` según saldos/vencimientos.

### Medidas de seguridad interna

- `assertInternalApiAuth` permite:
  - `x-api-key` o `Authorization: Bearer ...`.
- Variables esperadas:
  - `PAGACUOTAS_INTERNAL_API_KEY` o `INTERNAL_API_KEY`.
  - `PAGACUOTAS_INTERNAL_BEARER_TOKEN` o `INTERNAL_BEARER_TOKEN`.

Observaciones:

- `payment-attempts` no aplica `assertInternalApiAuth` en route.
- middleware de sesión actualmente intercepta APIs no públicas declaradas.

### Variables de entorno necesarias (PagaCuotas)

- `PAGACUOTAS_INTERNAL_API_KEY`
- `PAGACUOTAS_INTERNAL_BEARER_TOKEN`
- opcionales legacy:
  - `INTERNAL_API_KEY`
  - `INTERNAL_BEARER_TOKEN`

---

## 6. Importador de clientes

### Qué archivos acepta

- Solo `.xlsx` (`POST /api/importaciones/clientes/preview` valida extensión).

### Hojas requeridas

Por código (`parseWorkbook`), espera estas hojas exactas:

- `CLIENTES`
- `CONTACTOS`
- `FACTURACION`
- `CONTRATOS`
- `CUOTAS_OPCIONAL`

Si una falta, `extractRows` lanza error.

### Qué columnas reconoce y cómo normaliza headers

Normalización de headers (`normalizeHeader`):

- trim + lowercase;
- quita tildes y `*`;
- quita texto entre paréntesis;
- reemplaza espacios y símbolos por `_`;
- alias:
  - `cliente_id_interno_o_rut` -> `cliente_ref`
  - `contrato_id_o_cliente_id_rut` -> `contrato_ref`

### Validaciones principales

- RUT chileno válido (DV).
- nombre/razón social requerido.
- tipo persona mapeable (o inferido por RUT con warning).
- estado cliente/contrato/cuota válido o normalizable.
- fechas parseables.
- montos > 0 cuando aplica.
- referencias consistentes:
  - contrato-cliente,
  - cuota-contrato.
- duplicados en archivo:
  - RUT duplicado,
  - contrato duplicado,
  - cuota duplicada.
- consistencia financiera contrato-cuotas:
  - suma de cuotas vs monto contrato (con tolerancia de 10).
  - cantidad de cuotas vs `cantidad_cuotas`.

### Estados del importador (preview y confirmación)

- `READY`: sin issues bloqueantes.
- `REVIEW`: warnings, importable según política.
- `ERROR`: bloqueante.
- `SKIPPED`: omitido (ej. cuota no cobrable sin monto).
- `IMPORTED`: estado post-confirmación en ítems procesados.

### Qué pasa al confirmar importación

`confirmImport(batchId, policy)`:

1. batch pasa a `PROCESSING`.
2. carga items staging.
3. define política:
  - `onlyReady=true` (default seguro).
  - `allowReview` solo si `onlyReady=false`.
4. procesa contratos importables en chunks de 20.
5. por contrato ejecuta transacción (`maxWait: 10s`, `timeout: 30s`):
  - upsert `Cliente`;
  - upsert `ClienteContacto` principal;
  - upsert `ClienteFacturacion`;
  - upsert `Contrato`;
  - upsert `Cuota` relacionadas;
  - aplica lógica de pagos históricos en cuotas importadas cuando corresponde;
  - actualiza estados de items (`IMPORTED`/`SKIPPED`/`ERROR`).
6. batch pasa a `CONFIRMED`.
7. devuelve reporte final.

### Cómo funciona `onlyReady` / `allowReview`

- `onlyReady=true`: solo importa `READY`.
- `onlyReady=false` + `allowReview=true`: importa `READY` + `REVIEW`.
- Nunca importa `ERROR` ni `SKIPPED`.
- Si contrato READY depende de cliente no importable por política:
  - contrato y cuotas asociadas se marcan `SKIPPED` con issue explícito.

### Qué errores quedan guardados para revisión manual

En `getBatchReport`:

- `manualReview` incluye estados `ERROR`, `REVIEW`, `SKIPPED`.
- conserva `raw_data`, `normalized_data` e `issues`.

### Qué tablas crea/actualiza

Staging:

- `ClientImportBatch`
- `ClientImportItem`
- `ContractImportItem`
- `InstallmentImportItem`

Finales:

- `Cliente`
- `ClienteContacto`
- `ClienteFacturacion`
- `Contrato`
- `Cuota`
- `Pago` / `AplicacionPago` (si detecta pagos históricos)
- `ExternalReference` (`PAGACUOTAS` para cliente habilitado)

### Problemas conocidos/riesgos (incluyendo transacciones Prisma)

- transacción por contrato limitada a 30s: lotes grandes pueden fallar parcialmente.
- migración `20260506183737_non_collectible_installments` hace `DROP INDEX` que puede romper bootstrap limpio si no existe.
- reglas de pago histórico complejas: requiere fuerte monitoreo de idempotencia y conciliación.
- la hoja `CUOTAS_OPCIONAL` es “opcional” por nombre, pero técnicamente requerida en parser.

---

## 7. Estados y reglas de negocio

### Estado de cliente

`ACTIVO`, `AL_DIA`, `MOROSO`, `FINALIZADO`, `ANULADO`

- Significado: situación comercial/financiera del cliente.
- Asignación:
  - importador (`mapEstadoCliente`) o procesos internos.
- Permite/bloquea:
  - no hay guard de UI/API por estado.
- Vistas que lo usan:
  - `/clientes`, `/clientes/[id]`, `/dashboard`.

### Estado de contrato

`ACTIVO`, `PAGADO`, `EN_MORA`, `REPACTADO`, `TERMINADO`, `ANULADO`

- Significado: ciclo de vida contractual.
- Asignación:
  - importador,
  - recálculo financiero (`finance.service`, `payment-application.service`),
  - repactaciones.
- Vistas:
  - `/cuotas`, `/cuotas/[contratoId]`, `/clientes/[id]`, reportes.

### Estado de cuota

`PENDIENTE`, `PAGADA`, `PARCIAL`, `VENCIDA`, `REPROGRAMADA`, `REEMPLAZADA`, `ANULADA`, `CONDONADA`

- Significado: estado de pago/cobrabilidad de cuota.
- Asignación:
  - importador,
  - pago confirmado/reversa,
  - recálculo por saldo y vencimiento.
- Reglas:
  - no cobrables usan `cobrable=false` + `motivo_no_cobrable`.
- Vistas:
  - cobros, cuotas, reportes, deudores.

### Estado de pago

`REGISTRADO`, `CONFIRMADO`, `RECHAZADO`, `REVERSADO`

- Significado: estado contable del pago.
- Asignación:
  - integración PagaCuotas,
  - servicios financieros internos.
- Vistas:
  - `/pagos`, historial, reportes.

### Estado de importación

Batch:
- `PREVIEW_READY`, `PROCESSING`, `CONFIRMED`, `FAILED`.

Items:
- `READY`, `REVIEW`, `ERROR`, `SKIPPED`, `IMPORTED`.

- Significado: control de calidad y ejecución de import.
- Vistas:
  - `/admin/importaciones/clientes`.

### Estado de cobranza (derivado)

`SIN_GESTION`, `CONTACTADO`, `COMPROMISO_ACTIVO`, `COMPROMISO_INCUMPLIDO`, `MOROSO`, `CRITICO`

- Significado: severidad de cobranza.
- Asignación:
  - `inferEstadoCobranza` por días atraso, vencidas, gestión y repactación.
- Vistas:
  - `/clientes/deudores`, `/cobros-cuotas/cobros`.

### Estado de compromiso

No existe entidad explícita de compromiso.  
Se deriva desde contratos `REPACTADO` y comportamiento de cuotas.

### Estado de integración

Eventos:
- `PENDING`, `PROCESSED`, `FAILED`.

Sincronización externa:
- `STARTED`, `SUCCESS`, `PARTIAL`, `FAILED`.

- Vistas:
  - reflejo indirecto en historial y dashboard.

---

## 8. Base de datos (Prisma)

### Modelos principales

- Seguridad:
  - `Usuario`.
- Core financiero:
  - `Cliente`, `Contrato`, `Cuota`, `Pago`, `AplicacionPago`, `ModificacionContrato`.
- Legal:
  - `CasoLegal`.
- Integraciones:
  - `SistemaExterno`, `ExternalReference`, `IntegrationEvent`, `ExternalSyncLog`.
- Importador:
  - `ClientImportBatch`, `ClientImportItem`, `ContractImportItem`, `InstallmentImportItem`.
- Datos complementarios cliente:
  - `ClienteContacto`, `ClienteFacturacion`.

### Relaciones clave

- `Cliente 1-N Contrato`.
- `Contrato 1-N Cuota`.
- `Pago` referencia `Cliente`, `Contrato` y opcional `Cuota`.
- `Pago N-N Cuota` vía `AplicacionPago`.
- `ModificacionContrato` apunta a `Contrato` y opcional `Cuota`, con usuario/aprobador.
- `CasoLegal` vincula cliente/contrato y puede asociarse a cuotas.
- Integraciones externas trazadas por `ExternalReference` + `IntegrationEvent`.
- Import staging relaciona batch con items y referencias a entidades creadas.

### Modelos implementados pero poco/no usados en UI

- `CasoLegal` (sin vista dedicada).
- `AplicacionPago` (sin UI directa).
- `SistemaExterno`, `ExternalReference`, `IntegrationEvent`, `ExternalSyncLog` (solo trazabilidad backend).
- `ClienteContacto`, `ClienteFacturacion` (gestionados por importador, no por pantalla propia).

### Modelos faltantes para completar MVP de cuotas/cobranza (según sidebar objetivo)

- entidades explícitas de gestión de cobranza (gestión, compromiso, agenda de seguimiento).
- tesorería:
  - bancos,
  - cuentas,
  - movimientos de caja/banco,
  - conciliación.
- configuración:
  - permisos granulares (hoy solo rol simple),
  - parámetros de negocio.

### Riesgos/inconsistencias detectadas

1. Doble stack AT-INFORMA con variables distintas:
   - una parte usa `AT_INFORMA_API_URL/AT_INFORMA_API_KEY`;
   - otra exige `AT_INFORMA_BASE_URL/AT_INFORMA_TOKEN`.
2. Migración potencialmente frágil:
   - `20260506183737_non_collectible_installments` elimina índice que puede no existir.
3. Módulos de cobranza/tesorería/configuración existen en sidebar pero sin persistencia dedicada.

---

## 9. Tests y calidad

### Tests existentes

- Total ejecutado: 15 archivos, 94 tests, todos OK.
- Cobertura fuerte en:
  - `client-import.service`
  - `pagacuotas-integration.service`
  - reglas de `cuotas` y `cobranza`
  - integración AT-INFORMA (cliente/sync)
- Cobertura de rutas API:
  - parcial (`confirm import route`, `payment-intents validate route`, `public cuotas route`).

### Qué cubren

- validaciones de importación y políticas `onlyReady/allowReview`.
- idempotencia de confirmación e integración.
- pagos históricos en importador.
- reglas de cálculo financiero.
- estados de reversa/rechazo/validación PagaCuotas.

### Módulos con baja cobertura o sin tests dedicados

- vistas UI server/client (la mayoría sin tests).
- endpoints de reportes y cobros historial.
- middleware y comportamiento de rutas públicas detrás de middleware.
- botón sync AT-INFORMA (mismatch de contrato respuesta).

### Comandos y resultado actual

- `npm test` -> OK.
- `npm run lint` -> OK.
- `npm run build` -> OK.

Warning de build:

- deprecación de convención `middleware` -> migrar a `proxy`.

### Riesgos técnicos

1. API pública/interna potencialmente bloqueada por middleware de sesión global.
2. endpoint de intento de pago sin guard interno explícito.
3. discrepancia de env vars AT-INFORMA puede romper sync.
4. acciones clave de UI aún deshabilitadas (operación incompleta).
5. ausencia de control de rol para operaciones sensibles (ej. importación/sync).

---

## 10. Pendientes priorizados

### Crítico

1. Corregir seguridad/acceso en APIs de integración:
   - revisar middleware global para `/api/public/*` y `/api/integrations/*`.
2. Agregar `assertInternalApiAuth` en `POST /api/integrations/pagacuotas/payment-attempts`.
3. Unificar variables de entorno de AT-INFORMA (`API_URL/API_KEY` vs `BASE_URL/TOKEN`).
4. Corregir contrato de respuesta de `/api/internal/sync/at-informa` vs `AtInformaSyncButton`.
5. Revisar migración `20260506183737_non_collectible_installments` para evitar fallas en bootstrap.

### MVP

1. Implementar vistas faltantes de Cobranza (pendientes/vencidas/compromisos/gestiones).
2. Crear módulo de Contratos dedicado (hoy implícito en cuotas/clientes).
3. Habilitar acciones hoy disabled:
   - registrar pago,
   - registrar gestión,
   - crear compromiso.
4. Separar y formalizar “compromiso” como entidad/regla explícita.
5. Agregar permisos por rol para acciones críticas (importar/sync/reversa/manual).

### Mejora

1. Paginación y filtros avanzados en clientes, cuotas y pagos.
2. Tests de endpoints faltantes (reportes, cobros historial, middleware).
3. Mejorar observabilidad de integración (dash de eventos fallidos y reintentos).
4. Corregir textos mojibake (acentos mal codificados en UI).

### Futuro

1. Módulo Tesorería (bancos, movimientos, conciliación).
2. Configuración completa (empresa, parámetros, usuarios/permisos granulares).
3. Integración ERP contable más amplia (asientos, cierre, auditoría financiera).
4. Flujo documental tributario (boletas/facturas electrónicas) si entra al alcance.

---

## 11. Conclusión final

Estado real del sistema:

- La base financiera central está operativa y consistente para MVP técnico:
  - clientes, contratos, cuotas, pagos, reportes e importación avanzada.
- Integración PagaCuotas está implementada con reglas de idempotencia sólidas.
- Existen módulos visibles pero aún no construidos (Cobranza detallada, Tesorería, Configuración).
- Hay riesgos relevantes de arquitectura/seguridad por resolver antes de escalar:
  - middleware sobre APIs públicas/internas,
  - guard faltante en `payment-attempts`,
  - inconsistencia de variables AT-INFORMA.

Próximos pasos recomendados:

1. cerrar brechas críticas de seguridad y configuración;
2. habilitar acciones operativas hoy deshabilitadas;
3. completar módulos faltantes de Cobranza/Contratos/Tesorería;
4. reforzar cobertura de pruebas en APIs de borde y middleware.

