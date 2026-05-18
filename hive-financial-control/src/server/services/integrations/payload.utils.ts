export function pickString(
  source: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

export function pickNumber(
  source: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

export function pickDate(
  source: Record<string, unknown>,
  keys: string[],
): Date | undefined {
  const value = pickString(source, keys);
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function pickStringArray(
  source: Record<string, unknown>,
  keys: string[],
): string[] | undefined {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      const normalized = value
        .map((item) => (typeof item === "string" ? item.trim() : String(item)))
        .filter((item) => item.length > 0);
      if (normalized.length > 0) return normalized;
    }
  }
  return undefined;
}

export function toMoney(value: number | undefined, fallback = 0): number {
  if (value === undefined || Number.isNaN(value)) return fallback;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
