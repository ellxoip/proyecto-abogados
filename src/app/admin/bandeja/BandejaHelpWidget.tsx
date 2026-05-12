"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { generateHelpText } from "@/lib/ai-helper";

export function BandejaHelpWidget() {
  const [helpText, setHelpText] = useState("");

  const handleGenerateHelp = async () => {
    const generatedText = await generateHelpText();
    setHelpText(generatedText);
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-sm p-6 mb-6 shadow-sm">
      <h2 className="text-lg font-bold text-[var(--text)] mb-4">Registrar Nueva Actualización</h2>
      <textarea
        className="w-full border border-[var(--border-glass)] rounded-sm p-3 text-sm text-[var(--text)]"
        placeholder="Describa el avance del proceso, próximos pasos o documentación entregada..."
        value={helpText}
        onChange={(e) => setHelpText(e.target.value)}
      />
      <div className="flex justify-end mt-4">
        <button
          onClick={handleGenerateHelp}
          className="flex items-center gap-2 bg-[var(--bg)] text-[var(--gold)] px-5 py-2.5 rounded-sm text-[11px] font-bold uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-black/10"
        >
          <Plus className="w-4 h-4" />
          Generar Autoayuda
        </button>
        <button
          className="ml-3 flex items-center gap-2 bg-[var(--bg)] text-[var(--gold)] px-5 py-2.5 rounded-sm text-[11px] font-bold uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-black/10"
        >
          Publicar e Informar Cliente
        </button>
      </div>
    </div>
  );
}
