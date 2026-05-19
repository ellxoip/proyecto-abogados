# 🏛️ AT_INFORMA: Explicación del Proyecto

**AT_INFORMA** es el *Sistema Operativo Legal* (Legal Operating System) y CRM central desarrollado a medida para el estudio **Abogados Tributarios Chile**. 

El propósito principal del proyecto es digitalizar, automatizar y centralizar el seguimiento de procedimientos legales, reemplazando el uso de planillas manuales por una plataforma web moderna con un control estricto sobre el ciclo de vida del caso, la cobranza y la comunicación con el cliente.

---

## 🎯 Objetivos Clave

1. **Embudo Legal Estricto:** Garantizar que los casos sigan un flujo ordenado. No se asignan abogados ni se inicia el trabajo sin una validación de pago inicial (*Double Check*).
2. **Gestión de Cobranza Automatizada:** Controlar la morosidad mediante un sistema de escalamiento progresivo (hasta 3 meses) que culmina en la suspensión automática del caso (`HALTED_BY_PAYMENT`) si no se regulariza el pago.
3. **Desacoplamiento Financiero:** La lógica de administración detallada de cuotas se ha extraído a un sistema externo independiente (**PagaCuotas**), interactuando con AT_INFORMA a través de una API REST robusta.
4. **Transparencia y Comunicación:** Proveer un Portal de Cliente donde este puede ver actualizaciones en tiempo real, documentos, y chatear con su abogado, todo sincronizado instantáneamente.
5. **Trazabilidad:** Mantener un registro de auditoría (`AuditLog`) inmutable de todas las acciones críticas.

---

## 🏗️ Arquitectura y Flujo de Trabajo

El sistema está diseñado en torno a una **Máquina de Estados** para los casos legales:
*   `OPEN`: Ingesta inicial desde el CRM de ventas (Dante). Esperando validación de pago y *Double Check* del SuperAdmin.
*   `WAITING_CUOTAS`: A la espera de regularización por parte del sistema de cuotas externo.
*   `IN_PROGRESS`: Caso validado y con abogados asignados trabajando en él.
*   `HALTED_BY_PAYMENT`: Caso suspendido temporalmente por acumulación de morosidad.
*   `FINISHED`: Caso resuelto o cerrado.

### 👥 Roles del Sistema
El sistema maneja permisos granulares (Row-Level Security y Server Actions) divididos en:
*   **SuperAdmin:** Validación de pagos iniciales (*Double Check*), control total del sistema y gestión de mora.
*   **Jefe de Mesa:** Asignación obligatoria de abogados a los casos aprobados.
*   **Abogado:** Gestión del caso, subida de documentos y comunicación con el cliente.
*   **Cliente:** Acceso al portal para ver el estado de su caso, historial semanal, pagos y chat con su abogado.
*   **Sistema de Cuotas:** Rol de máquina para interactuar vía API para la regularización de pagos.

---

## 💻 Stack Tecnológico

El proyecto está construido con tecnologías modernas orientadas al rendimiento y la escalabilidad:

*   **Frontend y Backend:** Next.js 14 (App Router) + TypeScript.
*   **Base de Datos:** PostgreSQL alojado en Supabase, interactuando a través de Prisma ORM.
*   **Autenticación:** NextAuth.js v5 (con soporte para credenciales JWT y adaptación a roles).
*   **Tiempo Real (Realtime):** Supabase Realtime para la sincronización instantánea del chat dual (cliente/staff) y el estado de los casos.
*   **Tareas en Segundo Plano (Workers):** BullMQ + Redis para el envío asíncrono de correos, WhatsApp y la ejecución periódica del control de morosidad (*health-sweep*).
*   **Notificaciones:** Meta WhatsApp Business API (para alertas al celular del cliente) y Resend (para correos electrónicos).
*   **Estilos y UI:** Tailwind CSS y Zustand (para gestión de estado global del cliente).

---

## 🔌 Integraciones y API (v1)

Para mantener el sistema enfocado en la gestión legal, AT_INFORMA expone una **API externa (v1)** diseñada para la sincronización financiera:
*   **`/api/v1/pagos` y `/api/v1/plan-pagos`:** Permite que sistemas contables de terceros y el servicio *PagaCuotas* reporten pagos, actualicen el estado financiero de los clientes y, en consecuencia, reactiven automáticamente casos suspendidos (`HALTED_BY_PAYMENT` a `IN_PROGRESS`).
*   **Webhooks de Pago:** Integración directa con pasarelas como Flow.cl y Webpay.
*   **Ingesta CRM:** Webhooks seguros (`/api/webhooks/crm`) para recibir automáticamente nuevos clientes desde el departamento de ventas.

---

## 🚀 Resumen del Valor Aportado

AT_INFORMA transforma un estudio de abogados tradicional en una operación escalable. Asegura que el equipo trabaje **solo en casos pagados**, mejora la satisfacción del cliente al darle visibilidad 24/7 de su procedimiento, y elimina el error humano en el seguimiento de cuotas y plazos gracias a sus alertas automatizadas y workers en segundo plano.
