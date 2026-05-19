export default function GlobalLoading() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[var(--surface)]/60 backdrop-blur-sm">
      <div className="relative flex items-center justify-center">
        {/* Outer glowing ring */}
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--gold)] animate-spin w-16 h-16 opacity-75"></div>
        {/* Inner static ring */}
        <div className="rounded-full border-2 border-[var(--border-glass)] w-16 h-16 opacity-30"></div>
        {/* Center glowing dot */}
        <div className="absolute rounded-full bg-[var(--gold)] w-2 h-2 animate-pulse shadow-[0_0_10px_var(--gold)]"></div>
      </div>
      
      <p className="mt-6 text-sm font-bold text-[var(--text)] tracking-widest uppercase animate-pulse">
        Cargando
      </p>
      <p className="mt-2 text-[11px] text-[var(--text-muted)] text-center max-w-[250px]">
        Procesando la información de manera segura...
      </p>
    </div>
  );
}
