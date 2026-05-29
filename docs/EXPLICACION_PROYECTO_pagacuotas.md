# PagaCuotas - Sistema de Gestión de Cuotas y Pagos

## Descripción del Proyecto
**PagaCuotas** es un sistema independiente diseñado para gestionar el cobro y seguimiento de cuotas y planes de pago. El objetivo principal de este proyecto es abstraer y desacoplar la lógica de gestión de pagos y cuotas que originalmente residía en el sistema de gestión legal `At_informa`. 

Al separar esta funcionalidad en su propia plataforma (`PagaCuotas`), se logra un sistema más portátil, escalable y enfocado en la facturación, permitiendo una integración limpia mediante API con otros sistemas (como plataformas contables o el propio `At_informa`).

## Arquitectura de la Aplicación
La plataforma está dividida en dos portales principales:

### 1. Portal de Administración (`/admin`)
Interfaz orientada a los administradores o abogados del estudio/empresa para gestionar las finanzas y a los clientes.
- **Login:** Autenticación segura para administradores.
- **Dashboard:** Panel de control con métricas generales de ingresos, cuotas pendientes, pagos recientes, y gráficos estadísticos.
- **Clientes:** Gestión del directorio de clientes, visualización de casos y administración de sus respectivos planes de pago.
- **Integraciones:** Panel para configurar y administrar la comunicación mediante API con sistemas externos.

### 2. Portal de Clientes (`/client`)
Interfaz orientada al usuario final (el deudor/cliente) para que pueda consultar su estado de cuenta y realizar pagos de forma cómoda y autónoma.
- **Login:** Acceso privado para cada cliente.
- **Portal Principal:** Visualización clara de las cuotas pagadas, pendientes y vencidas, con sus respectivas fechas.
- **Módulo de Pago:** Interfaz enfocada en procesar o registrar los pagos de las cuotas correspondientes.

## Stack Tecnológico
La aplicación cuenta con una interfaz moderna y dinámica construida sobre las siguientes tecnologías:

- **Core Frontend:** React 19, TypeScript, y Vite.
- **Enrutamiento:** React Router v7.
- **Estilos y UI:** Tailwind CSS v4, logrando un diseño responsivo y moderno (complementado con `clsx` y `tailwind-merge`).
- **Animaciones e Iconos:** Animaciones fluidas manejadas con Framer Motion (`motion`) e iconografía a través de `lucide-react`.
- **Gráficos:** Visualización de datos estadísticos en el Dashboard mediante `recharts`.
- **Servidor/Backend base:** Preparado con Express y variables de entorno (`dotenv`) para construir la API que servirá para sincronizar datos e integrarse con bases de datos relacionales (Prisma ORM).

## Integración y Sincronización de Datos
El principal valor de ser un sistema independiente es su capacidad de interoperar. PagaCuotas está diseñado para:
1. **Recibir datos:** Consumir endpoints para obtener de `At_informa` la información relevante de clientes, casos y facturación pendiente a realizar.
2. **Reportar estados:** Actuar como fuente de verdad en el flujo del dinero, notificando mediante webhooks o API REST a `At_informa` (u otros sistemas) cuando una cuota ha sido pagada con éxito, asegurando registros consistentes a nivel global.
