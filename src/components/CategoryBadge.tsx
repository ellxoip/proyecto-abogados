// Replaced CaseCategory enum with dynamic Category model support
type CategoryProps = {
  category: { name: string } | string | null;
};

const PRESETS: Record<string, { bg: string; fg: string; border: string }> = {
  TRIBUTARIO: { bg: "rgba(156, 255, 0, 0.12)", fg: "var(--lemon)", border: "rgba(156, 255, 0, 0.28)" },
  PENAL:      { bg: "rgba(255, 0, 106, 0.12)", fg: "var(--red)", border: "rgba(255, 0, 106, 0.25)" },
  CIVIL:      { bg: "rgba(0, 240, 255, 0.1)", fg: "var(--cyan)", border: "rgba(0, 240, 255, 0.24)" },
  LABORAL:    { bg: "rgba(156, 255, 0, 0.1)", fg: "var(--lemon)", border: "rgba(156, 255, 0, 0.22)" },
  FAMILIA:    { bg: "rgba(255, 216, 74, 0.12)", fg: "var(--amber)", border: "rgba(255, 216, 74, 0.24)" },
  MIGRATORIO: { bg: "rgba(255, 255, 255, 0.06)", fg: "var(--text)", border: "var(--border-glass)" },
};

export function CategoryBadge({ category }: CategoryProps) {
  if (!category) {
    return (
      <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm bg-[var(--surface-3)] text-[var(--text-muted)] border border-[var(--border-glass)]">
        Sin Categoría
      </span>
    );
  }

  const name = typeof category === "string" ? category : category.name;
  const upper = name.toUpperCase();
  const s = PRESETS[upper] || { bg: "rgba(255,255,255,0.05)", fg: "var(--text-muted)", border: "var(--border-glass)" };

  return (
    <span 
      className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm border whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.fg, borderColor: s.border }}
    >
      {name}
    </span>
  );
}

