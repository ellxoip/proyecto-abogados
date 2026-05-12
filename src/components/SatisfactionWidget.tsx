"use client";

import { useState, useTransition } from "react";
import { Satisfaction } from "@prisma/client";
import { submitSatisfaction } from "@/app/portal/actions-feedback";

import { Smile, Meh, Frown, CheckCircle2 } from "lucide-react";

type Props = {
  caseId: string;
  initialValue?: Satisfaction | null;
};

export function SatisfactionWidget({ caseId, initialValue }: Props) {
  const [selected, setSelected] = useState<Satisfaction | null>(initialValue || null);
  const [submitted, setSubmitted] = useState(!!initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSelect = (val: Satisfaction) => {
    if (submitted || isPending) return;
    setError(null);
    
    startTransition(async () => {
      const res = await submitSatisfaction(caseId, val);
      if (res.ok) {
        setSelected(val);
        setSubmitted(true);
      } else {
        setError(res.reason ?? "No pudimos registrar tu evaluacion.");
      }
    });
  };

  const options = [
    { value: Satisfaction.HAPPY, icon: Smile, label: "Me gusto", color: "text-emerald-500", bg: "bg-emerald-50" },
    { value: Satisfaction.NEUTRAL, icon: Meh, label: "Normal", color: "text-amber-500", bg: "bg-amber-50" },
    { value: Satisfaction.SAD, icon: Frown, label: "Mala experiencia", color: "text-red-500", bg: "bg-[rgba(239,68,68,0.1)]" },
  ];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-[var(--text)] uppercase tracking-wider">Tu Opinión es Vital</h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Ayúdanos a mejorar tu experiencia legal.</p>
        </div>
        {submitted && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
      </div>

      <div className="flex justify-between gap-4">
        {options.map((opt) => {
          const Icon = opt.icon;
          const isActive = selected === opt.value;
          
          return (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              disabled={submitted || isPending}
              className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-lg transition-all border ${
                isActive 
                  ? `${opt.bg} border-current ${opt.color} scale-105 shadow-md` 
                  : `bg-[rgba(255,255,255,0.02)] border-transparent text-slate-400 grayscale hover:grayscale-0 hover:border-slate-200`
              } ${submitted && !isActive ? "opacity-30" : ""}`}
            >
              <Icon className={`w-8 h-8 ${isActive ? "animate-bounce-short" : ""}`} />
              <span className="text-[10px] font-bold uppercase tracking-widest">{opt.label}</span>
            </button>
          );
        })}
      </div>
      {error && (
        <p className="text-center text-[10px] font-bold text-red-500 uppercase tracking-widest mt-4">
          {error}
        </p>
      )}
      
      {submitted && (
        <p className="text-center text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-4">
          ¡Gracias por tu feedback! Trabajamos para ti.
        </p>
      )}
    </div>
  );
}
