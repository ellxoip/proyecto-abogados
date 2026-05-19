# Sistema Contable - Descripcion del Proyecto

## Vision general

El proyecto **Legal Finance MVP** es una plataforma web interno financiero-contable orientada a firmas de abogados.  
Su objetivo es centralizar el control de clientes, contratos, cuotas y pagos, asegurando trazabilidad de cambios y capacidad de reporte para la gestion operativa y de cobranza.

## Objetivos del sistema

- Consolidar la informacion financiera de cada cliente en un solo lugar.
- Estandarizar el ciclo de vida de contratos y planes de pago.
- Automatizar reglas contables basicas de cuotas, vencimientos y estados.
- Registrar pagos con criterio consistente (aplicacion a deuda mas antigua vencida).
- Mantener historial auditable de modificaciones y repactaciones.
- Entregar reportes operativos con exportacion CSV.

## Alcance funcional del MVP

- Gestion de clientes.
- Gestion de contratos.
- Generacion de cuotas y calendario de pago.
- Registro de pagos y actualizacion automatica de estados.
- Reprogramacion de cuotas.
- Repactacion de contratos sin eliminar historial (marcando cuotas reemplazadas).
- Trazabilidad en tabla de modificaciones de contrato.
- Reportes de pagos, cuentas por cobrar, vencimientos, morosidad y proyeccion.

## Flujo operativo resumido

1. Se crea o importa un contrato asociado a un cliente.
2. El sistema genera las cuotas segun el plan de pagos.
3. Se registran pagos y se aplican a cuotas pendientes/vencidas.
4. Se recalculan estados de cuotas y contrato en forma automatica.
5. Si hay cambios de condiciones, se reprograma o repacta dejando evidencia historica.
6. El equipo consulta dashboards y reportes, con opcion de exportar a CSV.

## Stack tecnologico

- Frontend: Next.js + TypeScript.
- Backend: Next.js App Router + Route Handlers.
- Base de datos: PostgreSQL.
- ORM: Prisma.
- Validacion: Zod.
- Testing: Vitest.

## Beneficios esperados

- Mejor control de cobranza y vencimientos.
- Menor riesgo de errores manuales en aplicacion de pagos.
- Mayor transparencia para auditoria interna.
- Base solida para evolucionar a un ERP legal-financiero mas completo.

## Estado actual

El MVP ya cuenta con modelo de datos, migraciones, servicios de negocio principales, pantallas administrativas iniciales y API de reportes.  
El foco actual del proyecto es fortalecer reglas financieras, trazabilidad y reportabilidad.
