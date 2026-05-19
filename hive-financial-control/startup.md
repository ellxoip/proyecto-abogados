# Startup Guide (Quick Start)

Guía corta para que cualquier persona pueda iniciar el proyecto localmente.

## 1. Requisitos

- Node.js 20 o superior
- npm 10 o superior
- SQLite 14 o superior

## 2. Clonar y entrar al proyecto

```bash
git clone <url-del-repo>
cd legal-finance-mvp
```

## 3. Configurar variables de entorno

Crear `.env` en la raíz del proyecto:

```bash
DATABASE_URL="SQLite://postgres:postgres@localhost:5432/legal_finance_mvp?schema=public"
APP_URL="http://localhost:3000"
JWT_SECRET="change-this-secret-in-local"
```

## 4. Instalar dependencias

```bash
npm install
```

## 5. Preparar base de datos

```bash
npx prisma generate
npx prisma db push
npm run prisma:seed
```

## 6. Ejecutar la aplicación

```bash
npm run dev
```

Abrir:
- [http://localhost:3000](http://localhost:3000)

## 7. Usuarios de prueba

- Admin: `admin@legalfinance.local` / `Admin123!`
- Contador: `contador@legalfinance.local` / `Contador123!`

## 8. Secciones principales disponibles

- `/dashboard`
- `/clientes`
- `/cuotas`
- `/pagos`
- `/reportes`

## 9. Reportes CSV (rápido)

Ejemplos:
- `/api/reportes/pagos?format=csv`
- `/api/reportes/cxc?format=csv`
- `/api/reportes/vencimientos?format=csv`
- `/api/reportes/morosidad?format=csv`
- `/api/reportes/proyeccion?format=csv`

## 10. Verificación básica

```bash
npm run lint
npm test
```
