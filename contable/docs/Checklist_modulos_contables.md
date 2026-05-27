# Roadmap Módulos Contables — Legal Finance MVP

---

## [✅] Dashboard
> Vista ejecutiva del estado financiero y operacional del estudio. Punto de entrada principal del sistema.

- [✅] KPIs principales — muestra ingresos del período, CxC, cuotas vencidas, clientes morosos
- [✅] Selector de período — filtrar por hoy / semana / mes / rango personalizado con calendario
- [✅] Gráfico de ingresos — evolución temporal con línea de comparación período anterior
- [✅] Desglose financiero — ingresos, CxC, vencido recuperable, recaudación esperada, proyección
- [✅] Segunda fila de métricas — contratos activos, nuevos contratos, cuotas próximas 7 días, nuevos clientes
- [✅] Acceso rápido a alertas — links directos a cuotas vencidas y clientes morosos

---

## [✅] Clientes
> Gestión completa del portafolio de clientes del estudio, sus contratos, deudas y estado de relación.

### [✅] Clientes — listado y ficha de cada cliente del estudio
- [✅] Listar clientes — tabla con nombre, RUT, tipo, estado, fecha ingreso; búsqueda y filtros
- [✅] Crear cliente — formulario con RUT, nombre, tipo (persona/empresa), teléfono, email
- [✅] Editar cliente — modificar datos de contacto y clasificación (EditarClienteModal + PATCH /api/clientes/[id])
- [✅] Ver ficha cliente — detalle con contratos activos, historial de pagos, contactos, facturación
- [✅] Cambiar estado cliente — selector en modal de edición; estados activo/moroso/finalizado/anulado
- [✅] Añadir contactos adicionales — múltiples contactos por cliente con roles (ContactosSection + API)
- [✅] Datos de facturación — RUT facturación, razón social, giro, dirección (FacturacionSection + API upsert)

### [✅] Deudores — clientes con deuda pendiente y gestión de cobranza
- [✅] Listado de deudores — tabla con deuda total, vencida, días de atraso, estado cobranza
- [✅] Filtros de cobranza — por estado (sin gestión, contactado, compromiso, moroso, crítico)
- [✅] Detalle de deudor — desglose de cuotas vencidas por contrato en ficha cliente
- [✅] Indicador de criticidad — colores y alertas según días de atraso

### [✅] Contratos — contratos de servicios legales asociados a clientes
- [✅] Listar contratos — tabla con cliente, servicio, fecha, monto, saldo, estado
- [✅] Buscar y filtrar — por cliente, RUT, servicio, estado del contrato
- [✅] Editar contrato — modificar servicio, fecha, monto, cantidad de cuotas, estado, observaciones
- [✅] Ver cuotas del contrato — acceso directo al detalle de cuotas
- [✅] Estados del contrato — activo, pending initial payment, en mora, repactado, pagado, terminado, anulado
- [✅] Historial de modificaciones — registro de cambios con motivo y usuario en detalle de contrato

### [✅] Importar clientes — carga masiva de clientes y contratos desde planillas
- [✅] Subir archivo Excel/CSV — preview de datos antes de confirmar
- [✅] Validación de datos — errores por RUT duplicado, campos faltantes, formato incorrecto
- [✅] Reporte de importación — resumen de creados, actualizados, con errores
- [✅] Confirmar o rechazar lote — control de aprobación antes de persistir

---

## [ ] Cobranza
> Gestión operacional del proceso de cobro: cuotas, pagos, mora, compromisos y seguimiento de gestiones.

### [ ] Cuotas — listado de cuotas pendientes y vencidas por cobrar
- [✅] Listar cuotas — tabla con cliente, contrato, número cuota, monto, vencimiento, días atraso
- [✅] Filtrar cuotas — por estado (pendiente, vencida, parcial), cliente, rango de fechas, monto
- [✅] Registrar pago — aplicar pago a una cuota específica con monto, medio y referencia
- [✅] Ver detalle cuota — historial de pagos aplicados, saldo pendiente
- [ ] Marcar cuota como no cobrable — con motivo (condonación, acuerdo, etc.)

### [ ] Pagos — historial consolidado de todos los pagos recibidos
- [✅] Listar pagos — tabla con fecha, cliente, servicio, monto, medio, estado
- [✅] Filtrar pagos — por cliente, RUT, medio de pago, rango de fechas
- [✅] Mini-dashboard — pagos del mes, monto cobrado, desglose por medio de pago
- [ ] Exportar pagos — CSV con los pagos del período filtrado
- [ ] Ver pago — detalle con cuota aplicada, comprobante, referencia

### [ ] Morosidad — seguimiento detallado de cartera vencida
- [✅] Resumen de mora — total vencido, cantidad de clientes morosos, días promedio atraso
- [ ] Tabla de mora por tramos — 0-30, 31-60, 61-90, +90 días
- [ ] Detalle por cliente moroso — cuotas vencidas, monto, historial de gestiones
- [ ] Exportar cartera morosa — listado para gestión externa o cobranza judicial

### [ ] Compromisos de pago — acuerdos de pago pactados con clientes
- [✅] Listar compromisos activos — cliente, contrato, fecha compromiso, monto comprometido
- [ ] Registrar compromiso — fecha y monto acordado con el cliente
- [ ] Alerta de incumplimiento — detecta compromisos no pagados en fecha
- [ ] Historial de compromisos — cumplidos, incumplidos, vigentes por cliente

### [ ] Gestiones — registro de acciones de cobranza realizadas
- [ ] Registrar gestión — llamada, email, visita, carta; con fecha, usuario y resultado
- [ ] Listar gestiones por cliente — cronología de contactos y seguimientos
- [ ] Gestiones pendientes — alertas de seguimiento programado
- [ ] Plantillas de gestión — textos predefinidos para comunicaciones de cobranza

### [ ] Historial de pagos — trazabilidad completa de eventos operacionales
- [✅] Listar eventos — cliente creado, contrato modificado, pago registrado, error de integración
- [✅] Filtrar historial — por tipo evento, origen (manual/sistema/PagaCuotas), fechas
- [✅] Mini-dashboard historial — total eventos, pagos confirmados, monto cobrado, gestiones
- [ ] Ver evento detallado — metadata completa del evento, estado anterior y nuevo
- [ ] Exportar historial — para auditoría o reporte regulatorio

---

## [ ] Tesorería
> Control del flujo de dinero real de la empresa: cuentas bancarias, movimientos, conciliación y caja.

### [ ] Bancos — instituciones bancarias vinculadas al estudio
- [ ] Listar bancos configurados — nombre, número de cuenta, tipo, saldo actual
- [ ] Agregar banco/cuenta — nombre institución, número cuenta, tipo cuenta, moneda
- [ ] Editar o desactivar cuenta bancaria

### [ ] Cuentas bancarias — detalle de cada cuenta y su saldo
- [ ] Ver saldo actual — saldo contable vs saldo banco
- [ ] Historial de movimientos por cuenta — ingresos, egresos, saldo por fecha
- [ ] Conciliación por cuenta — comparar movimientos importados vs registros del sistema

### [ ] Movimientos — registro de todos los ingresos y egresos
- [ ] Listar movimientos — fecha, tipo, descripción, monto, cuenta, saldo acumulado
- [ ] Registrar movimiento manual — ingreso o egreso con categoría, cuenta, referencia
- [ ] Filtrar movimientos — por cuenta, tipo, categoría, rango de fechas, monto
- [ ] Adjuntar comprobante — imagen o PDF del respaldo del movimiento

### [ ] Pagos recibidos — ingresos desde clientes conciliados con cuenta bancaria
- [ ] Listar pagos recibidos — monto, fecha, origen (transferencia, depósito, cheque)
- [ ] Conciliar pago con cuota — vincular depósito bancario al pago de una cuota
- [ ] Pagos no conciliados — alerta de ingresos sin cuota asociada

### [ ] Egresos — salidas de dinero de la empresa
- [ ] Registrar egreso — proveedor, categoría, monto, cuenta débito, fecha, comprobante
- [ ] Listar egresos — tabla con filtros por proveedor, categoría, fecha, estado
- [ ] Aprobar egresos — flujo de aprobación antes de registrar el pago
- [ ] Programar egresos — egresos recurrentes automáticos (arriendos, sueldos, etc.)

### [ ] Flujo de caja — proyección de entradas y salidas futuras
- [ ] Vista mensual — ingresos esperados vs egresos programados por mes
- [ ] Saldo proyectado — acumulado futuro basado en cuotas por cobrar y compromisos de pago
- [ ] Alerta de déficit — aviso cuando la proyección muestra saldo negativo
- [ ] Comparar real vs proyectado — diferencia entre lo cobrado y lo esperado

### [ ] Conciliación bancaria — matching entre cartola bancaria y movimientos del sistema
- [ ] Importar cartola — cargar archivo del banco (Excel o OFX)
- [ ] Matching automático — vincular movimientos del banco con registros del sistema
- [ ] Movimientos sin conciliar — revisar diferencias y aprobar manualmente
- [ ] Reporte de conciliación — resumen de conciliados, pendientes, diferencias

### [ ] Caja chica — gestión de fondos menores de la oficina

#### [ ] Resumen caja chica — estado actual del fondo y uso mensual
- [ ] Ver saldo disponible del fondo
- [ ] Historial de reposiciones y rendiciones

#### [ ] Fondos — apertura y configuración de fondos de caja chica
- [ ] Crear fondo — nombre, monto asignado, responsable, cuenta débito
- [ ] Listar fondos activos
- [ ] Ajustar monto del fondo

#### [ ] Gastos caja chica — registro de gastos menores con cargo al fondo
- [ ] Registrar gasto — fecha, categoría, descripción, monto, responsable, comprobante
- [ ] Listar gastos por fondo y período
- [ ] Adjuntar boleta/ticket escaneado

#### [ ] Rendiciones — cierre de período con detalle de gastos realizados
- [ ] Crear rendición — agrupar gastos del período para aprobación
- [ ] Aprobar o rechazar rendición con observaciones
- [ ] Historial de rendiciones aprobadas

#### [ ] Reposiciones — solicitud de recarga del fondo luego de rendir
- [ ] Solicitar reposición — adjuntar rendición aprobada
- [ ] Aprobar reposición — genera egreso en tesorería
- [ ] Historial de reposiciones

#### [ ] Aprobaciones — flujo de revisión de rendiciones y reposiciones
- [ ] Cola de aprobaciones pendientes por rol
- [ ] Aprobar o devolver con comentario
- [ ] Notificación al solicitante

#### [ ] Configuración caja chica — parámetros del fondo
- [ ] Monto máximo por gasto
- [ ] Categorías habilitadas
- [ ] Flujo de aprobación (1 o 2 niveles)

---

## [ ] Ventas
> Gestión de documentos tributarios de venta: boletas, facturas, notas de crédito y facturación recurrente.

### [ ] Servicios — catálogo de servicios ofrecidos y sus precios
- [ ] Listar servicios — nombre, descripción, precio referencia, tipo impuesto
- [ ] Crear/editar servicio — datos para prellenar documentos de venta
- [ ] Activar/desactivar servicio del catálogo

### [ ] Documentos de venta — listado consolidado de todos los documentos emitidos
- [ ] Listar documentos — fecha, tipo, número, cliente, neto, IVA, total, estado
- [ ] Filtrar — por tipo, cliente, período, estado (emitido, pagado, anulado)
- [ ] Ver detalle documento — líneas, impuestos, historial de estado
- [ ] Anular documento — genera nota de crédito automática si aplica
- [ ] Exportar al SII — envío electrónico de DTE o preparar XML

### [ ] Comprobantes — documentos internos de ingreso no tributarios
- [ ] Crear comprobante de ingreso — para pagos que no requieren factura/boleta
- [ ] Listar y filtrar comprobantes
- [ ] Imprimir o enviar por email

### [ ] Boletas — boletas electrónicas de honorarios o servicios
- [ ] Emitir boleta — datos cliente, servicio, monto, impuesto
- [ ] Listar boletas emitidas con estado SII
- [ ] Reenviar boleta por email
- [ ] Anular boleta — con motivo y nota de crédito asociada

### [ ] Facturas exentas — facturas sin IVA para servicios legales exentos
- [ ] Emitir factura exenta — datos completos para DTE
- [ ] Listar facturas con estado (emitida, aceptada SII, reclamada, anulada)
- [ ] Imprimir PDF o enviar por email
- [ ] Anular y generar nota de crédito

### [ ] Notas de crédito — documentos de ajuste para anular o modificar facturas/boletas
- [ ] Emitir nota de crédito — vinculada al documento original
- [ ] Listar notas de crédito emitidas
- [ ] Aplicar nota de crédito a deuda del cliente

### [ ] Facturación recurrente — automatización de documentos periódicos
- [ ] Crear regla de facturación — cliente, servicio, periodicidad, día de emisión
- [ ] Listar reglas activas
- [ ] Ejecución automática o con confirmación manual
- [ ] Historial de documentos generados por cada regla

---

## [ ] Compras
> Gestión de proveedores, gastos y documentos de compra del estudio.

### [ ] Proveedores — registro de empresas y personas que prestan servicios al estudio
- [ ] Listar proveedores — nombre, RUT, categoría, saldo pendiente, estado
- [ ] Crear proveedor — RUT, nombre, giro, contacto, datos bancarios para pago
- [ ] Editar o desactivar proveedor
- [ ] Ver ficha proveedor — documentos de compra, pagos realizados, deuda vigente

### [ ] Gastos — registro de gastos operacionales del estudio
- [ ] Listar gastos — fecha, proveedor, categoría, monto, estado de pago
- [ ] Registrar gasto — proveedor, categoría, descripción, monto, IVA, cuenta contable
- [ ] Aprobar gasto — flujo de aprobación para gastos sobre cierto monto
- [ ] Pagar gasto — vincular al egreso de tesorería correspondiente
- [ ] Adjuntar comprobante — factura o boleta del proveedor

### [ ] Documentos de compra — facturas y boletas recibidas de proveedores
- [ ] Listar documentos recibidos — proveedor, tipo, número, fecha, monto, estado
- [ ] Ingresar documento — tipo (factura, boleta, nota de crédito recibida), datos
- [ ] Validar con SII — consulta registro de compras del período
- [ ] Registrar como gasto — genera el gasto contable asociado
- [ ] Gestionar reclamaciones — rechazar factura incorrecta ante el SII

### [ ] Honorarios recibidos — boletas de honorarios de profesionales externos
- [ ] Listar boletas de honorarios recibidas — emisor, monto bruto, retención, neto
- [ ] Ingresar boleta de honorario — datos del emisor, monto, retención 10.75%
- [ ] Calcular retención automática
- [ ] Pagar honorario neto — genera egreso y registro de retención por declarar

### [ ] Cuentas por pagar — control de deudas pendientes con proveedores
- [ ] Listar CxP — proveedor, documento, vencimiento, monto, estado
- [ ] Programar pago — fecha de pago y cuenta de cargo
- [ ] Pagar cuenta — registra egreso y marca documento como pagado
- [ ] Alerta de vencimiento — documentos próximos a vencer

---

## [ ] Contabilidad
> Motor contable completo: plan de cuentas, comprobantes, libros, ajustes y estados financieros.

### [ ] Plan de cuentas — estructura jerárquica de cuentas contables del estudio
- [ ] Listar cuentas — código, nombre, tipo (activo/pasivo/patrimonio/resultado), nivel
- [ ] Crear cuenta — código, nombre, naturaleza, si recibe movimientos
- [ ] Editar o desactivar cuenta
- [ ] Importar plan de cuentas estándar — plantilla para estudios jurídicos

### [ ] Tipos de comprobantes — categorías de asientos (venta, compra, ajuste, etc.)
- [ ] Listar tipos configurados
- [ ] Crear tipo de comprobante — nombre, numeración, cuentas por defecto
- [ ] Editar o desactivar tipo

### [ ] Comprobantes contables — asientos manuales o generados por el sistema
- [ ] Listar comprobantes — fecha, tipo, número, descripción, total debe/haber
- [ ] Crear comprobante — partidas con cuenta débito/crédito, monto, glosa
- [ ] Editar comprobante borrador
- [ ] Aprobar y cerrar comprobante — una vez aprobado no se modifica
- [ ] Anular comprobante — con contraasiento automático
- [ ] Ver detalle de partidas

### [ ] Asientos automáticos — reglas para generar comprobantes desde eventos del sistema
- [ ] Configurar asiento por pago recibido — qué cuentas se debitan/acreditan
- [ ] Configurar asiento por factura emitida
- [ ] Configurar asiento por gasto registrado
- [ ] Activar/desactivar reglas automáticas

### [ ] Libro diario — listado cronológico de todos los asientos del período
- [ ] Ver libro diario — ordenado por fecha, con debe/haber y saldo acumulado
- [ ] Filtrar por período, tipo comprobante, cuenta
- [ ] Exportar PDF o Excel para auditoría

### [ ] Libro mayor — movimientos por cuenta contable
- [ ] Seleccionar cuenta y período — ver todos los movimientos de la cuenta
- [ ] Saldo inicial, movimientos y saldo final
- [ ] Exportar por cuenta o rango de cuentas

### [ ] Ajustes — asientos de corrección y ajustes de fin de período
- [ ] Registrar ajuste — con tipo (depreciación, provisión, corrección monetaria)
- [ ] Listar ajustes del período
- [ ] Revertir ajuste con contraasiento

### [ ] Cierres — proceso de cierre de período contable
- [ ] Cierre mensual — bloquea modificaciones del período cerrado
- [ ] Cierre anual — genera asiento de resultado y apertura del ejercicio
- [ ] Historial de cierres — períodos cerrados y fecha de cierre

### [ ] Balance de 8 columnas — planilla de trabajo contable
- [ ] Generar balance de comprobación y saldos
- [ ] Columnas: sumas debe/haber, saldos deudores/acreedores, ajustes, resultados
- [ ] Exportar a Excel o PDF

### [ ] Estado de resultados — ingresos, costos y utilidad del período
- [ ] Ver resultado por período — ingresos vs gastos agrupados por categoría
- [ ] Comparar períodos — mes actual vs mes anterior vs mismo mes año anterior
- [ ] Exportar estado de resultados

### [ ] Ficha contable — movimientos de una cuenta específica en detalle
- [ ] Buscar cuenta — por código o nombre
- [ ] Ver todos los movimientos con glosa, comprobante y saldo
- [ ] Exportar ficha

---

## [ ] Reportes
> Reportes operacionales y financieros por área del sistema.

### [✅] Contabilidad
- [✅] Pagos recibidos — listado de pagos con filtros de fecha, cliente, servicio
- [✅] Cuentas por cobrar (CxC) — saldo pendiente total por cliente y contrato
- [✅] Vencimientos — cuotas próximas a vencer por período
- [✅] Morosidad — cartera vencida por tramos de días
- [✅] Proyección de caja — ingresos esperados vs compromisos futuros

### [ ] Cobranza
- [✅] Efectividad de cobranza — % de cobro sobre total esperado por período
- [✅] Compromisos de pago — activos, cumplidos e incumplidos
- [ ] Gestiones realizadas — cantidad y tipo de gestión por usuario y período

### [✅] Clientes
- [✅] Clientes nuevos — altas por período con detalle
- [✅] Distribución de clientes — por tipo, estado, servicio
- [✅] Retención de clientes — tasa de permanencia y bajas
- [✅] LTV por cliente — valor total facturado y cobrado por cliente

### [✅] Contratos
- [✅] Cartera de servicios — contratos activos por tipo de servicio
- [✅] Modificaciones de contratos — repactaciones y cambios del período
- [✅] Condonaciones — cuotas condonadas con motivo y monto
- [✅] Casos legales — contratos asociados a casos activos
- [✅] Cuotas vs casos — comparación cuotas de contratos con y sin caso legal

### [ ] Ventas
- [ ] Documentos emitidos — boletas, facturas, notas de crédito por período
- [ ] Venta por servicio — ingresos agrupados por tipo de servicio
- [ ] Libro de ventas — reporte tributario para SII

### [ ] Compras
- [ ] Documentos recibidos — facturas y boletas de proveedor por período
- [ ] Gastos por categoría — desglose de gastos operacionales
- [ ] Libro de compras — reporte tributario para SII
- [ ] Cuentas por pagar — deuda vigente con proveedores

### [ ] Tesorería
- [ ] Flujo de caja real — ingresos y egresos efectivos por período
- [ ] Saldos bancarios — saldo actual y evolución por cuenta
- [ ] Conciliación bancaria — reporte de diferencias

### [ ] Caja chica
- [ ] Gastos por fondo — desglose de uso de caja chica por categoría
- [ ] Rendiciones del período — resumen de rendiciones aprobadas

### [ ] Historial
- [✅] Historial operativo completo — todos los eventos del sistema con filtros
- [ ] Auditoría de cambios — quién modificó qué y cuándo

---

## [ ] Importadores
> Carga masiva de datos desde fuentes externas (Excel, CSV, archivos bancarios, SII).

### [✅] Clientes — importación masiva de clientes y contratos desde Excel
- [✅] Subir archivo — preview de filas antes de confirmar
- [✅] Validar datos — RUT, duplicados, campos obligatorios
- [✅] Confirmar o descartar lote
- [✅] Reporte de importación — creados, errores, omitidos

### [ ] Proveedores — carga de proveedores desde planilla
- [ ] Subir plantilla de proveedores
- [ ] Validar RUT y datos
- [ ] Importar o reportar errores

### [ ] Cartolas bancarias — importar movimientos bancarios para conciliación
- [ ] Subir cartola en formato Excel o OFX/QIF
- [ ] Parsear movimientos — fecha, glosa, cargo/abono
- [ ] Match automático con movimientos del sistema
- [ ] Revisar movimientos sin match

### [ ] Documentos de venta — carga de DTE emitidos externos al sistema
- [ ] Subir XML o Excel con DTE
- [ ] Validar con SII
- [ ] Importar como documentos del libro de ventas

### [ ] Documentos de compra — carga de facturas recibidas
- [ ] Subir XML DTE recibidos desde SII
- [ ] Procesar como facturas de proveedor
- [ ] Registrar gastos asociados

### [ ] Libro compra/venta SII — sincronización con registros tributarios del SII
- [ ] Conectar con API SII — RUT + clave SII o certificado digital
- [ ] Importar libro de ventas del período
- [ ] Importar libro de compras del período
- [ ] Detectar diferencias con registros internos

---

## [ ] Configuración
> Parámetros del sistema, usuarios, permisos y datos maestros de la empresa.

### [ ] Empresa — datos de la empresa que usa el sistema
- [ ] Editar datos empresa — razón social, RUT, giro, dirección, teléfono, email
- [ ] Logo y datos para documentos tributarios
- [ ] Actividades económicas para SII
- [ ] Año fiscal y moneda base

### [ ] Usuarios — personas con acceso al sistema
- [ ] Listar usuarios — nombre, email, rol, estado, último acceso
- [ ] Crear usuario — datos, rol (admin/contador/analista/solo lectura)
- [ ] Editar o desactivar usuario
- [ ] Cambiar contraseña o forzar reset

### [ ] Permisos — control de acceso por módulo y acción
- [ ] Definir roles — qué puede ver/crear/editar/eliminar cada rol
- [ ] Asignar permisos por módulo y submódulo
- [ ] Restricciones por usuario específico

### [ ] Parámetros — configuración general del comportamiento del sistema
- [ ] Días de gracia para mora — a partir de cuántos días se marca vencida una cuota
- [ ] Tasa de interés por mora
- [ ] Numeración automática de contratos/documentos
- [ ] Zona horaria y formato de fechas

### [ ] Tipos de documentos — clasificación de documentos tributarios
- [ ] Listar tipos — boleta, factura exenta, nota de crédito, comprobante
- [ ] Configurar numeración — folio inicial, siguiente folio
- [ ] Vincular con cuentas contables

### [ ] Tipos de comprobantes contables — categorías de asientos
- [ ] Crear tipo — nombre, numeración, descripción
- [ ] Asignar cuentas por defecto

### [ ] Condiciones de pago — plazos y formas de pago habituales
- [ ] Crear condición — nombre, días de plazo, descripción (ej: "30 días")
- [ ] Asignar condición por defecto a proveedores/clientes

### [ ] Impuestos — tasas de impuestos aplicables
- [ ] Listar impuestos — IVA 19%, exento, retenido, honorarios
- [ ] Crear impuesto — nombre, tasa, tipo (débito/crédito)

### [ ] Bancos y cuentas corrientes — cuentas bancarias del estudio
- [ ] Agregar banco — institución, número cuenta, tipo, moneda
- [ ] Cuenta principal para pagos y cobros

### [ ] Tipos de movimiento — categorías de movimientos de tesorería
- [ ] Crear tipo — nombre, naturaleza (ingreso/egreso), cuenta contable asociada
- [ ] Marcar como recurrente

### [ ] Categorías de gastos — clasificación de los gastos operacionales
- [ ] Listar categorías — nombre, cuenta contable
- [ ] Crear/editar categoría

### [ ] Caja chica — configuración de los fondos de caja chica
- [ ] Monto máximo por gasto
- [ ] Responsables por fondo
- [ ] Flujo de aprobación

### [ ] Plantillas — plantillas de documentos para generar PDFs
- [ ] Plantilla de contrato — campos dinámicos con datos del cliente
- [ ] Plantilla de estado de cuenta — resumen de cuotas y pagos
- [ ] Plantilla de factura/boleta — con logo y datos empresa

### [ ] Carta de cobranza — plantillas para comunicaciones de cobro
- [ ] Crear plantilla — texto con variables (nombre cliente, monto, vencimiento)
- [ ] Asignar por tramo de mora — carta diferente según días de atraso
- [ ] Envío manual o automático por email/WhatsApp

### [ ] Integraciones — conexiones con sistemas externos
- [✅] PagaCuotas — portal de pago online para clientes
- [✅] CRM — sincronización de oportunidades ganadas como contratos
- [✅] AT-Informa — consulta de deudores en sistema de información comercial
- [ ] SII — integración tributaria para DTE
- [ ] Bancos — conexión para descarga automática de cartolas

---

## [ ] Administración
> Panel de control para gestión multi-empresa, seguridad global y auditoría del sistema.

### [ ] Empresas — gestión de múltiples estudios o empresas en el sistema
- [ ] Listar empresas — nombre, RUT, plan, estado
- [ ] Crear empresa — datos, configuración inicial
- [ ] Cambiar entre empresas — acceso a múltiples organizaciones
- [ ] Suspender o eliminar empresa

### [ ] Usuarios globales — usuarios con acceso a múltiples empresas
- [ ] Listar usuarios globales
- [ ] Asignar usuario a empresa con rol específico
- [ ] Revocar acceso a empresa

### [ ] Seguridad — configuración de políticas de acceso y autenticación
- [ ] Política de contraseñas — longitud mínima, expiración, complejidad
- [ ] 2FA — autenticación de dos factores
- [ ] Sesiones activas — ver y revocar sesiones abiertas
- [ ] IP permitidas — restricción de acceso por dirección IP

### [ ] Auditoría — log de acciones críticas en el sistema
- [ ] Ver log de auditoría — usuario, acción, entidad afectada, fecha, IP
- [ ] Filtrar por usuario, módulo, fecha
- [ ] Exportar log para revisión externa

### [ ] Multiempresa — configuración de comportamiento compartido
- [ ] Compartir plan de cuentas entre empresas
- [ ] Configuración global aplicable a todas las empresas
- [ ] Reportes consolidados multi-empresa

---

## [ ] BI y análisis
> Inteligencia de negocio e indicadores avanzados para la toma de decisiones del estudio.

### [ ] Dashboard ejecutivo — vista consolidada de los KPIs más importantes
- [ ] KPIs financieros — ingresos, gastos, utilidad, liquidez
- [ ] KPIs de cobranza — efectividad, mora, compromisos
- [ ] KPIs de clientes — retención, LTV, nuevos ingresos
- [ ] Selector de período y comparación entre períodos

### [ ] Reportes personalizados — generador de reportes ad-hoc
- [ ] Seleccionar entidad base — clientes, contratos, pagos, cuotas
- [ ] Agregar columnas y filtros dinámicos
- [ ] Guardar reporte personalizado para uso futuro
- [ ] Exportar a Excel o PDF

### [ ] Constructor de reportes — interfaz visual para armar tablas y gráficos
- [ ] Drag & drop de campos — desde catálogo de campos disponibles
- [ ] Configurar agrupaciones — por cliente, servicio, mes, estado
- [ ] Elegir tipo de visualización — tabla, línea, barra, pie
- [ ] Compartir reporte con otros usuarios

### [ ] Indicadores financieros — métricas clave de salud financiera del estudio
- [ ] Ingresos recurrentes vs puntuales
- [ ] Margen de cobranza
- [ ] Días promedio de cobro (DSO)
- [ ] Crecimiento de cartera mes a mes

### [ ] Indicadores de cobranza — performance del proceso de cobro
- [ ] Tasa de mora por tramo de antigüedad
- [ ] Efectividad por medio de pago
- [ ] Tiempo promedio de cobro desde vencimiento
- [ ] Compromisos cumplidos vs incumplidos

### [ ] Indicadores por abogado — rendimiento de cada profesional del estudio
- [ ] Contratos activos por abogado
- [ ] Ingresos generados por abogado
- [ ] Casos en mora por abogado
- [ ] Tasa de retención de clientes por abogado

### [ ] Indicadores por cliente — análisis del valor y comportamiento de cada cliente
- [ ] LTV histórico — total facturado y cobrado en el tiempo
- [ ] Puntualidad de pago — % de cuotas pagadas a tiempo
- [ ] Servicios contratados — diversidad de servicios por cliente
- [ ] Riesgo estimado — scoring basado en historial de pago

### [ ] Indicadores por contrato — análisis de desempeño de cada contrato
- [ ] Tasa de cobro — % del monto cobrado sobre monto total
- [ ] Duración promedio por tipo de servicio
- [ ] Contratos en riesgo — mora + días atraso + sin gestión
- [ ] Comparar contratos similares — benchmarking interno

### [ ] Rentabilidad por caso — análisis de rentabilidad por caso legal
- [ ] Ingresos del caso — cuotas cobradas vinculadas al caso
- [ ] Horas dedicadas — si hay integración con sistema de tiempos
- [ ] Costo estimado — gastos directos del caso
- [ ] Margen por caso — ingreso vs costo estimado
