# Migraciones de base de datos

PagaCuotas ya no debe depender de `prisma db push` para producción. Ese comando queda reservado para prototipos locales.

## Flujo recomendado

1. Desarrollo local:
   ```bash
   npm run db:migrate:dev
   ```

2. Producción:
   ```bash
   npm run db:migrate:deploy
   ```

3. Generación de cliente Prisma:
   ```bash
   npm run db:generate
   ```

La migración `20260508170000_add_operational_indexes` agrega índices para búsquedas de cliente, portal, conciliación, outbox, DLQ, logs de integración y soporte.
