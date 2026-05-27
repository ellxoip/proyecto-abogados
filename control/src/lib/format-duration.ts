/**
 * Helpers únicos para formatear duración como HH:MM:SS (UI productividad).
 *
 * El schema actual de TimeEntry solo guarda `durationMinutes`. Estas
 * helpers aceptan minutos (o ms cuando viene del cronómetro) y siempre
 * devuelven `HH:MM:SS`. Si la fuente solo tiene minutos, los segundos
 * salen en `00`.
 *
 * Pensado para casos donde el negocio quiere ver la precisión de tiempo
 * (Registro de Horas, cabecera de caso, totalización por categoría),
 * dejando atrás el viejo formato "0.0h" que escondía sesiones cortas.
 */

export function formatHmsFromMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatHmsFromMinutes(minutes: number): string {
  return formatHmsFromMs(Math.max(0, Math.round(minutes * 60_000)));
}

/**
 * Variante "compacta" para tarjetas pequeñas: "1h 30m 12s" o "12s" si es < 1m.
 * Útil cuando la columna no soporta el ancho fijo de HH:MM:SS.
 */
export function formatHmsCompact(minutes: number): string {
  const totalSec = Math.max(0, Math.round(minutes * 60));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) parts.push(`${m}m`);
  parts.push(`${s.toString().padStart(2, "0")}s`);
  return parts.join(" ");
}
