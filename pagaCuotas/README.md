<<<<<<< HEAD
# 💳 PagaCuotas - Sistema Empresarial de Gestión de Pagos

**PagaCuotas** es un sistema backend y frontend robusto, diseñado para centralizar y orquestar el cobro de cuotas. Funciona como el puente definitivo entre los sistemas internos de la empresa (como **SIS.CONTABLE** y **CRM**) y múltiples pasarelas de pago externas.

---

## 🚀 Arquitectura y Mejoras Recientes (v1.0.0)

El proyecto ha evolucionado de un prototipo a una solución de grado de producción (*Enterprise-ready*), incorporando las siguientes características clave:

### 1. Capa de Abstracción de Pasarelas (Provider Gateway Layer)
Arquitectura multi-proveedor que permite integrar y alternar pasarelas de pago sin modificar la lógica central del negocio.
*   **🔌 Proveedor activo:** MercadoPago (única pasarela habilitada). Simulator disponible solo para desarrollo y QA.
*   **🧪 Simulador Integrado:** Proveedor `simulator` con reglas deterministas basadas en el monto (ej. cobros terminados en `99` simulan fondos insuficientes) para pruebas E2E sin depender de APIs externas.
*   **🏗️ Entornos:** Soporte nativo para modo `sandbox` y `production`.

### 2. Sincronización Dual y Resiliencia (Dual Sync & Retry System)
*   **SIS.CONTABLE (Fuente de la Verdad):** Se valida la deuda *antes* de intentar el cobro. Los pagos aprobados, rechazados y reversados se sincronizan automáticamente.
*   **CRM (FastAPI):** Se notifican los pagos exitosos vía JWT autenticado para actualizar el pipeline de ventas e iniciar flujos de WhatsApp.
*   **Cola de Reintentos (Backoff Exponencial):** Si el CRM o SIS.CONTABLE están caídos durante un Webhook, el sistema encola la notificación y reintenta la sincronización (`notification.service.ts`).

### 3. Seguridad y Trazabilidad Total
*   **Idempotencia:** Protección contra webhooks duplicados de los proveedores de pago.
*   **Integration Logs:** Cada petición HTTP hacia sistemas externos (inbound/outbound) queda registrada en la base de datos con tiempos de respuesta y payloads exactos para auditoría.
*   **Validación Estricta:** Uso de **Zod** en todos los endpoints para garantizar la integridad de los datos de entrada.

---

## 🛠️ Stack Tecnológico

**Backend (API Rest):**
*   **Core:** Node.js, Express, TypeScript.
*   **Base de Datos & ORM:** Prisma + SQLite (fácilmente migrable a PostgreSQL/MySQL).
*   **Validación:** Zod.

**Frontend (Portal):**
*   **Core:** React 19, TypeScript, Vite.
*   **Estilos y UI:** Tailwind CSS v4, Framer Motion, Lucide React.
*   **Enrutamiento:** React Router v7.

---

## ⚙️ Requisitos y Configuración

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar Variables de Entorno:**
   Copia el archivo `.env.example` a `.env` y configura tus credenciales:
   ```env
   # Proveedor por Defecto y Entorno
   PAYMENT_ENVIRONMENT=sandbox
   PAYMENT_DEFAULT_PROVIDER=simulator

   # SIS.CONTABLE
   SIS_CONTABLE_BASE_URL=http://localhost:3000
   SIS_CONTABLE_API_KEY=tu_api_key

   # CRM
   CRM_BASE_URL=http://localhost:8000
   CRM_EMAIL=admin@example.com
   CRM_PASSWORD=tu_password
   ```

3. **Preparar la Base de Datos:**
   Genera el cliente Prisma y sube el esquema:
   ```bash
   npm run db:reset
   ```

---

## 🏃‍♂️ Ejecución del Proyecto

El sistema está diseñado para levantar el backend y frontend de manera independiente:

*   **Levantar API Backend** (Puerto 4000):
    ```bash
    npm run server
    ```
*   **Levantar Portal Frontend** (Puerto 3000):
    ```bash
    npm run dev
    ```

### 🧪 Simulación de Flujos (Pruebas de Integración)

Para verificar que toda la orquestación (SIS.CONTABLE ↔ PagaCuotas ↔ CRM ↔ Proveedor) funciona correctamente, ejecuta el script de simulación maestro:

```bash
# Simula el flujo completo (crear, confirmar, estado, rechazo y reversa)
npm run integration:simulate-flow
```

---

## 📖 Estructura de Directorios Clave

*   `/server/providers/`: Capa de abstracción y lógica de pasarelas de pago.
*   `/server/services/`: Lógica central de pagos y cola de notificaciones.
*   `/server/clients/`: Clientes HTTP tipados para conexión con SIS.CONTABLE y CRM.
*   `/server/validators/`: Esquemas Zod.
*   `/src/pages/`: Vistas de React para el Portal de Cliente y Dashboard de Administración.
*   `/scripts/`: Herramientas de simulación e integración.
=======
# pagaCuotas
Este es el sistema de paga cuotas, super funcional.
>>>>>>> 375a8d073d60c61c8f64463942fd43fbc13a0315
