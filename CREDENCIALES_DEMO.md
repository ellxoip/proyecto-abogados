# Credenciales Demo

Credenciales pensadas solo para QA, demos locales y validacion funcional. No deben usarse en produccion.

## PagaCuotas

| Perfil | Usuario | Password | Notas |
|---|---|---|---|
| SuperAdmin | `superadmin@pagacuotas.demo` | `Demo2026!` | Default local si no se definen `ADMIN_EMAIL` y `ADMIN_PASSWORD`. |
| Cliente demo | RUT `16.798.821-0` | `DEMO26` | Requiere `SIS_CONTABLE_LOCAL_FIXTURES=true`. Clave debe cumplir regex `^[a-zA-Z0-9]{6}$` (6 chars alfanum). |

Variables recomendadas para demo local:

```env
ADMIN_EMAIL=superadmin@pagacuotas.demo
ADMIN_PASSWORD=Demo2026!
ADMIN_TOKEN_SECRET=demo_admin_token_secret_2026_change_outside_local
CLIENT_TOKEN_SECRET=demo_client_token_secret_2026_change_outside_local
SIS_CONTABLE_LOCAL_FIXTURES=true
CRM_ENABLED=false
PAYMENT_ENVIRONMENT=sandbox
PAYMENT_DEFAULT_PROVIDER=simulator
```

## Hive Service Control

Estos usuarios quedan creados al correr `npm run db:seed` dentro de `hive-service-control`.

| Perfil | Usuario | Password | Notas |
|---|---|---|---|
| SuperAdmin demo | `superadmin.demo@hivecontrol.cl` | `Demo2026!` | Acceso staff para bandeja, mora y monitoreo. |
| Cliente demo | `cliente.demo@hivecontrol.cl` | `Cliente2026!` | Cliente con caso `AT-DEMO-001` y RUT `16798821-0`. |

Credenciales base que ya existian:

| Perfil | Usuario | Password |
|---|---|---|
| SuperAdmin base | `jorge@atinforma.cl` | `Admin2026!` |
| Jefe de Grupo | `jefe@atinforma.cl` | `Jefe2026!` |
| Abogado | `abogado@atinforma.cl` | `Abogado2026!` |
| Cliente base | `cliente@gmail.com` | `Cliente2026!` |

## Quick-fill en login UI

Los 4 logins (PagaCuotas admin/cliente, Hive cliente/equipo) muestran un panel **Demo** con botón "Usar credenciales demo" que prellena el formulario.

Gate de visibilidad:
- **PagaCuotas (Vite)**: visible si `import.meta.env.DEV` o `VITE_SHOW_DEMO_CREDS=true`.
- **Hive (Next)**: visible si `NODE_ENV !== "production"` o `NEXT_PUBLIC_SHOW_DEMO_CREDS=true`.

En producción quedan ocultos por default. Para forzar visibilidad en preview/staging, setear la env var explícita.
