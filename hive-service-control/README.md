# AT INFORMA v3.0 — Legal Operating System

**AT INFORMA** es un sistema operativo legal de alto rendimiento diseñado para la gestión integral de procesos judiciales y administrativos. La versión 3.0 integra el sistema de diseño **LemonKiller**, cumplimiento normativo **ISO 27001** y análisis de productividad impulsado por IA.

![LemonKiller Aesthetic](https://img.shields.io/badge/Design-LemonKiller_MVP-gold?style=for-the-badge)
![Security](https://img.shields.io/badge/Security-ISO_27001_Compliant-emerald?style=for-the-badge)
![Tech](https://img.shields.io/badge/Stack-Next.js_14-blue?style=for-the-badge)

---

## 💎 Diseño y Estética: LemonKiller MVP
El sistema ha sido migrado a una interfaz premium de alto contraste basada en el **LemonKiller Design System**:
- **Dark Mode Nativo**: Fondo profundo (`#0A0A0A`) con acentos en oro (`var(--gold)`).
- **Glassmorphism**: Paneles con efectos de desenfoque de fondo y bordes de cristal.
- **Tipografía Moderna**: Uso de *Space Grotesk* para interfaces técnicas y *Playfair Display* para elegancia legal.
- **Micro-animaciones**: Transiciones suaves y efectos de hover dinámicos en toda la plataforma.

---

## 🔒 Seguridad de la Información (ISO 27001)
Implementación robusta de controles de seguridad para la protección de expedientes delicados:
- **Control de Acceso Estricto (RBAC)**: Jerarquía de permisos clara (SuperAdmin, Jefe de Mesa, Abogado, Cliente).
- **Auditoría Exhaustiva**: Registro de cada acción (logins, asignaciones, cambios de estado, descargas) con actor, fecha y canal.
- **Cabeceras de Seguridad**: Protección contra Clickjacking, XSS y MIME-sniffing configurada a nivel de servidor.
- **Gestión de Sesiones**: Expiración automática de tokens y protección contra fuerza bruta mediante retardos controlados.
- **Identity Challenge**: Verificación de identidad adicional para acceder a expedientes marcados como "Delicados".

---

## 🚀 Funcionalidades Clave

### 💼 Gestión de Expedientes
- **Ingreso Rápido**: Onboarding simplificado de clientes y creación de casos en un solo paso.
- **Bandeja de Entrada**: Centro de mando para la asignación estratégica de casos a abogados.
- **Validación de Término**: Los casos solo pueden finalizarse tras cumplir hitos de gestión obligatorios (asignación y avances registrados).
- **Certificado de Término**: Generación automática de certificados firmados al concluir procesos.

### 📊 Control de Gestión (Exclusivo SuperAdmin)
- **Métricas de Operación**: Análisis en tiempo real de carga de trabajo y rendimiento.
- **SLA Management**: Control estricto de tiempos de respuesta por categoría legal.
- **Análisis de IA**: Detección automática de casos estancados o con riesgo de incumplimiento.
- **Ranking de Productividad**: Evaluación del desempeño del equipo basada en scores compuestos.

### 💬 Centro de Comunicación
- **Mensajería en Tiempo Real**: Chat integrado entre cliente y equipo legal.
- **Notificaciones Multi-canal**: Encolamiento de mensajes vía WhatsApp y Email (procesados por BullMQ).
- **Feedback de Satisfacción**: Sistema de medición mediante caritas (Excelente, Regular, Insatisfecho) al finalizar cada caso.

---

## 🛠️ Stack Tecnológico
- **Core**: [Next.js 14](https://nextjs.org/) (App Router)
- **Lenguaje**: [TypeScript](https://www.typescriptlang.org/)
- **ORM**: [Prisma](https://www.prisma.io/)
- **Base de Datos**: PostgreSQL (Supabase)
- **Caché/Colas**: [Redis](https://redis.io/) + [BullMQ](https://bullmq.io/)
- **Autenticación**: [NextAuth.js v5](https://authjs.dev/)
- **Estilos**: [Tailwind CSS](https://tailwindcss.com/)

---

## ⚙️ Instalación y Configuración

### Requisitos Previos
- Node.js 18+
- Instancia de PostgreSQL
- Instancia de Redis (para las colas de notificaciones)

### Variables de Entorno (.env)
```env
# Database
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Auth
AUTH_SECRET="tu-secreto-aqui"
NEXTAUTH_URL="http://localhost:3000"

# Redis (BullMQ)
REDIS_URL="redis://localhost:6379"

# Notificaciones
META_WHATSAPP_TOKEN="..."
RESEND_API_KEY="..."
```

### Configuración del Proyecto
1. **Instalar dependencias**: `npm install`
2. **Sincronizar base de datos**: `npx prisma db push`
3. **Generar cliente Prisma**: `npx prisma generate`
4. **Iniciar modo desarrollo**: `npm run dev`

---

## 👥 Roles del Sistema
- **SuperAdmin**: Control total, métricas de gestión, configuración de equipo y SLAs.
- **Jefe de Mesa**: Asignación de casos y supervisión de la bandeja de entrada.
- **Abogado**: Gestión operativa de expedientes asignados y registro de hitos.
- **Cliente**: Acceso exclusivo a sus propios casos, chat con su abogado y descarga de documentos.

---
*AT INFORMA — v3.0 Digital Legal Excellence*
