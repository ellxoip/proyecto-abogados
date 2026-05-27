"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const ESTADOS = [
  { value: "", label: "Todos los estados" },
  { value: "AL_DIA", label: "Al día" },
  { value: "CON_DEUDA", label: "Con deuda" },
  { value: "MOROSO", label: "Moroso" },
  { value: "PAGADO", label: "Pagado" },
  { value: "EN_REVISION", label: "En revisión" },
] as const;

export function CuotasFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const estado = searchParams.get("estado") ?? "";

  const push = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const clear = useCallback(() => {
    router.push(pathname);
  }, [router, pathname]);

  const hasFilters = q !== "" || estado !== "";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        placeholder="Buscar por nombre o RUT..."
        defaultValue={q}
        onChange={(e) => push("q", e.target.value)}
        className="h-9 w-64 rounded-md border border-[var(--border)] bg-white px-3 text-sm placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
      />
      <select
        value={estado}
        onChange={(e) => push("estado", e.target.value)}
        className="h-9 rounded-md border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
      >
        {ESTADOS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hasFilters && (
        <button
          type="button"
          onClick={clear}
          className="h-9 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--muted)] hover:bg-slate-50"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}
