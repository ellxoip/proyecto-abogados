"use client";

import { useState, useTransition } from "react";
import { Category } from "@prisma/client";
import { quickIntake } from "./actions";
import { useRouter } from "next/navigation";
import { User, Phone, Mail, Hash, BookOpen, CreditCard, Upload, CheckCircle2, ChevronRight } from "lucide-react";

export function QuickIntakeForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "+56",
    caseCode: `AT-${new Date().getFullYear()}-`,
    categoryId: "",
    isPaid: false,
    receiptUrl: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await quickIntake(formData as any);
      if (res.ok && "caseId" in res) {
        router.push(`/admin/casos/${res.caseId}`);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Section 1: Client Identity */}
      <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-[var(--surface-2)] border-b border-[var(--border-glass)] flex items-center gap-2">
          <User className="w-4 h-4 text-[var(--gold)]" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--gold)]">Identidad del Cliente</h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Nombre Completo</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                required
                type="text"
                placeholder="Ej: Juan Pérez"
                className="w-full pl-10 pr-4 py-2.5 bg-[rgba(255,255,255,0.02)] border border-slate-200 rounded outline-none focus:border-[var(--gold)] transition-all text-sm"
                value={formData.fullName}
                onChange={e => setFormData({ ...formData, fullName: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Teléfono / WhatsApp</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                required
                type="text"
                placeholder="+569..."
                className="w-full pl-10 pr-4 py-2.5 bg-[rgba(255,255,255,0.02)] border border-slate-200 rounded outline-none focus:border-[var(--gold)] transition-all text-sm"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Correo Institucional (Opcional)</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                placeholder="cliente@email.com"
                className="w-full pl-10 pr-4 py-2.5 bg-[rgba(255,255,255,0.02)] border border-slate-200 rounded outline-none focus:border-[var(--gold)] transition-all text-sm"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Case Logistics */}
      <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-[var(--surface-2)] border-b border-[var(--border-glass)] flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[var(--gold)]" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--gold)]">Detalles del Expediente</h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Código de Seguimiento</label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                required
                type="text"
                className="w-full pl-10 pr-4 py-2.5 bg-[rgba(255,255,255,0.02)] border border-slate-200 rounded outline-none focus:border-[var(--gold)] transition-all text-sm font-bold tracking-widest"
                value={formData.caseCode}
                onChange={e => setFormData({ ...formData, caseCode: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Categoría Legal</label>
            <select
              required
              className="w-full px-4 py-2.5 bg-[rgba(255,255,255,0.02)] border border-slate-200 rounded outline-none focus:border-[var(--gold)] transition-all text-sm appearance-none"
              value={formData.categoryId}
              onChange={e => setFormData({ ...formData, categoryId: e.target.value })}
            >
              <option value="">Seleccione una área...</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Section 3: Financial Integrity Check */}
      <div className={`bg-[var(--surface)] border rounded-lg shadow-sm overflow-hidden transition-all duration-300 ${formData.isPaid ? "border-emerald-200 shadow-emerald-50" : "border-[var(--border-glass)]"}`}>
        <div className={`px-6 py-4 border-b flex items-center justify-between ${formData.isPaid ? "bg-emerald-50 border-emerald-200" : "bg-[var(--surface-2)] border-[var(--border-glass)]"}`}>
          <div className="flex items-center gap-2">
            <CreditCard className={`w-4 h-4 ${formData.isPaid ? "text-emerald-600" : "text-[var(--gold)]"}`} />
            <h2 className={`text-xs font-bold uppercase tracking-widest ${formData.isPaid ? "text-emerald-600" : "text-[var(--gold)]"}`}>
              Validación de Pago Inicial
            </h2>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer" 
              checked={formData.isPaid}
              onChange={e => setFormData({ ...formData, isPaid: e.target.checked })}
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--surface)] after:border-[var(--border-glass)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            <span className="ml-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">¿Pago Confirmado?</span>
          </label>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-4 p-4 bg-[rgba(255,255,255,0.02)] rounded border border-dashed border-slate-300">
            <div className="w-12 h-12 rounded-full bg-[var(--surface)] flex items-center justify-center text-slate-400">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Cargar Comprobante de Pago</p>
              <p className="text-[10px] text-slate-400">Arraste el archivo o haga clic para seleccionar.</p>
            </div>
            <input type="file" className="hidden" />
          </div>
          {formData.isPaid ? (
            <div className="mt-4 flex items-center gap-2 text-emerald-600 animate-in slide-in-from-left-2">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em]">El expediente se activará inmediatamente tras el ingreso.</span>
            </div>
          ) : (
            <div className="mt-4 text-amber-600">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em]">Aviso: El caso se ingresará como "Detenido" hasta validar el pago.</span>
            </div>
          )}
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-[var(--bg)] text-[var(--gold)] py-4 rounded-lg text-xs font-bold uppercase tracking-[0.3em] flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl shadow-black/10 group disabled:opacity-50"
      >
        {isPending ? "Procesando Ingreso..." : "Ingresar Expediente al Sistema"}
        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>
    </form>
  );
}
