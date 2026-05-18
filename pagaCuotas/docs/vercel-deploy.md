# Despliegue en Vercel

PagaCuotas puede desplegar el frontend Vite y la API Express como funcion serverless de Vercel.

## Importante sobre base de datos

El proyecto actualmente usa Prisma con SQLite para desarrollo local. SQLite no es persistente en funciones serverless de Vercel. Para operar en produccion usa una base externa, idealmente PostgreSQL, y migra el `datasource` de Prisma antes de procesar pagos reales.

Para una demo visual o pruebas de frontend, puedes desplegar sin pagos reales. Para cobros reales no uses SQLite serverless.

## Variables minimas en Vercel

Configura en Project Settings > Environment Variables:

```env
DATABASE_URL=...
APP_URL=https://tu-proyecto.vercel.app
VITE_API_BASE_URL=https://tu-proyecto.vercel.app
PAYMENT_ENVIRONMENT=sandbox
PAYMENT_DEFAULT_PROVIDER=mercadopago
SIS_CONTABLE_BASE_URL=https://...
SIS_CONTABLE_API_KEY=...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
ADMIN_TOKEN_SECRET=...
```

Para produccion de pagos, agrega credenciales reales:

```env
PAYMENT_ENVIRONMENT=production
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_PUBLIC_KEY=APP_USR-...
MERCADOPAGO_WEBHOOK_SECRET=...
```

Webhook MercadoPago:

```text
https://tu-proyecto.vercel.app/api/webhooks/payment-provider/mercadopago
```

## Comandos

```bash
npm run lint
npm run build
npx vercel
npx vercel --prod
```
