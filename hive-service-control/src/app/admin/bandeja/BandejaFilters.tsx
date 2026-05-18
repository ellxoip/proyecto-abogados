"use client";

type CategoryObj = { id: string; name: string };

type Props = {
  categories: (CategoryObj | string | null)[];
  selectedCategory: string;
  selectedStage: string;
};


const STAGE_LABELS: Record<string, string> = {
  "": "Todos los Estados",
  OPEN: "Nuevos / Abiertos",
  WAITING_CUOTAS: "Esperando Pago Inicial",
  IN_PROGRESS: "En Proceso",
  HALTED_BY_PAYMENT: "Detenidos por Falta de Pago",
  FINISHED: "Terminados",
};

export function BandejaFilters({ categories, selectedCategory, selectedStage }: Props) {
  function navigate(key: string, value: string) {
    const url = new URL(window.location.href);
    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
    window.location.href = url.toString();
  }

  return (
    <div className="flex flex-wrap gap-4 mb-6">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold ml-1">
          Filtrar por Categoría
        </label>
        <select
          value={selectedCategory}
          onChange={(e) => navigate("category", e.target.value)}
          className="text-sm border border-[var(--border-glass)] rounded-sm px-4 py-2 bg-[var(--surface)] outline-none focus:border-[var(--gold)] transition-colors min-w-[200px]"
          style={{ color: "var(--text)" }}
        >
          <option value="">Todas las categorías</option>
          {categories
            .filter((c): c is (CategoryObj | string) => c !== null)
            .map((cat) => {
              const val = typeof cat === "string" ? cat : cat.id;
              const label = typeof cat === "string" ? cat : cat.name;
              return (
                <option key={val} value={val}>
                  {label}
                </option>
              );
            })}

        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold ml-1">
          Filtrar por Estado
        </label>
        <select
          value={selectedStage}
          onChange={(e) => navigate("stage", e.target.value)}
          className="text-sm border border-[var(--border-glass)] rounded-sm px-4 py-2 bg-[var(--surface)] outline-none focus:border-[var(--gold)] transition-colors min-w-[220px]"
          style={{ color: "var(--text)" }}
        >
          {Object.entries(STAGE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

