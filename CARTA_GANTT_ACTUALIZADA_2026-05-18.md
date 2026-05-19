# Carta Gantt actualizada - Proyecto Abogados

Fecha de actualizacion: 2026-05-18

## Resumen

La Gantt se actualiza con base en la revision tecnica mas reciente del workspace actual:

- `NEXIO`, `hive-service-control`, `hive-financial-control` y `pagaCuotas` viven ahora en la raiz del proyecto.
- El foco inmediato no debe ser nuevas pantallas, sino cierre de riesgos de produccion.
- La ejecucion sigue un modelo Scrum liviano con vibe coding usando Claude y Codex, pero con hardening tecnico obligatorio antes del go-live.

## Cambios clave respecto al plan anterior

1. Se adelanta un Sprint 0 real de saneamiento tecnico.
2. Se agregan bloqueadores P0 explicitos:
   - conflicto Git en `pagaCuotas/README.md`
   - auth faltante en `payment-attempts`
   - webhooks mock de Flow/Webpay en AT INFORMA
   - crons en `vercel.json` que apuntan a rutas inexistentes
   - endurecimiento de NEXIO: CORS, `SECRET_KEY`, DB productiva
3. Se mantiene la meta de MVP productivo, pero condicionada a evidencia de CI, UAT y rollback.

## Fechas objetivo

| Fase | Inicio | Fin |
| --- | --- | --- |
| Sprint 0 - Saneamiento | 2026-05-19 | 2026-05-23 |
| Sprint 1 - Hardening base | 2026-05-26 | 2026-06-06 |
| Sprint 2 - CI, datos y despliegue | 2026-06-09 | 2026-06-20 |
| Sprint 3 - Integraciones reales | 2026-06-23 | 2026-07-04 |
| Sprint 4 - Pagos y DTE productivos | 2026-07-07 | 2026-07-18 |
| Sprint 5 - UAT legal y productividad | 2026-07-21 | 2026-08-01 |
| Sprint 6 - UAT financiero y cobranza | 2026-08-04 | 2026-08-15 |
| Sprint 7 - Release y go-live | 2026-08-18 | 2026-08-22 |
| Hypercare | 2026-08-25 | 2026-09-05 |

## Condicion de go-live

No se recomienda produccion si falta cualquiera de estos puntos:

- PagaCuotas sin conflicto de merge resuelto.
- `payment-attempts` sin autenticacion interna.
- AT INFORMA aun procesando pagos desde mocks.
- Crons productivos con rutas inexistentes.
- NEXIO con CORS abierto, `SECRET_KEY` temporal o SQLite por defecto.
- Sin validacion reproducible de build, lint, tests y smoke.

