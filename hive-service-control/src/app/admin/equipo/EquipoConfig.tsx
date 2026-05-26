"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCategory, createStaffMember } from "./actions";
import { UserPlus, FolderPlus, CheckCircle, AlertCircle, Crown, Scale, ChevronDown } from "lucide-react";
import { Role } from "@/lib/db-enums";

type JefeMesa = { id: string; fullName: string };

type Props = {
  role: Role;
  jefes: JefeMesa[];
};

export function EquipoConfig({ role, jefes }: Props) {
  const router = useRouter();
  const [catName, setCatName] = useState("");
  const [staffRole, setStaffRole] = useState<"JEFE_DE_MESA" | "ABOGADO">("ABOGADO");
  const [staffData, setStaffData] = useState({
    fullName: "", email: "", phone: "", password: "", managedById: "",
  });
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const isSuperAdmin = role === Role.SUPER_ADMIN;

  function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!catName.trim()) return;
    setMsg(null);
    startTransition(async () => {
      const res = await createCategory(catName.trim());
      if (res.ok) {
        setMsg({ type: "ok", text: `Categoría "${catName}" creada exitosamente.` });
        setCatName("");
        router.refresh();
      } else {
        setMsg({ type: "err", text: res.reason! });
      }
    });
  }

  function handleCreateStaff(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res = await createStaffMember({
        fullName: staffData.fullName,
        email: staffData.email,
        phone: staffData.phone,
        password: staffData.password,
        role: staffRole,
        managedById: staffRole === "ABOGADO" ? staffData.managedById : undefined,
      });
      if (res.ok) {
        const roleName = staffRole === "JEFE_DE_MESA" ? "Jefe de Grupo" : "Abogado";
        setMsg({ type: "ok", text: `${roleName} "${staffData.fullName}" registrado exitosamente.` });
        setStaffData({ fullName: "", email: "", phone: "", password: "", managedById: "" });
        router.refresh();
      } else {
        setMsg({ type: "err", text: res.reason! });
      }
    });
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {msg && (
        <div className={`p-4 rounded-sm border flex items-center gap-3 ${
          msg.type === "ok" ? "bg-[rgba(34,197,94,0.1)] border-green-500/20 text-green-800" : "bg-[rgba(239,68,68,0.1)] border-red-500/20 text-red-800"
        }`}>
          {msg.type === "ok" ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="text-sm font-medium">{msg.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Category Management */}
        <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-sm p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-[var(--gold)10] rounded-sm">
              <FolderPlus className="w-5 h-5 text-[var(--gold)]" />
            </div>
            <h3 className="text-xl font-bold text-[var(--text)] font-serif">Nueva Categoría Legal</h3>
          </div>
          
          <form onSubmit={handleCreateCategory} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5 block">Nombre de la Categoría</label>
              <input
                type="text"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Ej: DERECHO CORPORATIVO"
                className="w-full text-sm border border-[var(--border-glass)] rounded-sm px-4 py-2.5 outline-none focus:border-[var(--gold)] transition-all"
                disabled={isPending}
              />
            </div>
            <button
              type="submit"
              disabled={isPending || !catName.trim()}
              className="w-full bg-[var(--bg)] text-white text-xs font-bold uppercase tracking-[0.2em] py-3.5 rounded-sm hover:bg-[var(--bg-deep)] transition-colors disabled:opacity-50"
            >
              {isPending ? "Procesando..." : "Registrar Categoría"}
            </button>
          </form>
          <p className="text-[10px] text-[var(--text-muted)] mt-4 leading-relaxed italic">
            * Las nuevas categorías estarán disponibles inmediatamente en el formulario de ingreso de casos.
          </p>
        </div>

        {/* Staff Management (SuperAdmin only) */}
        {isSuperAdmin ? (
          <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-sm p-8 shadow-sm relative overflow-hidden">
            {/* Power badge */}
            <div className="absolute top-0 right-0 p-3">
              <span className="text-[8px] font-black bg-[var(--sidebar-bg)] text-white px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-sm">Super Admin Only</span>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-[rgba(59,130,246,0.1)] rounded-sm">
                <UserPlus className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-[var(--text)] font-serif">Registrar Personal</h3>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-4">
              {/* Role Selector */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2 block">Tipo de Rol</label>
                <div className="flex bg-slate-100 p-1 rounded-sm gap-1">
                  <button
                    type="button"
                    onClick={() => { setStaffRole("JEFE_DE_MESA"); setStaffData(d => ({ ...d, managedById: "" })); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all rounded-sm ${
                      staffRole === "JEFE_DE_MESA"
                        ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    <Crown className="w-3.5 h-3.5" />
                    Jefe de Grupo
                  </button>
                  <button
                    type="button"
                    onClick={() => setStaffRole("ABOGADO")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all rounded-sm ${
                      staffRole === "ABOGADO"
                        ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    <Scale className="w-3.5 h-3.5" />
                    Abogado
                  </button>
                </div>
              </div>

              {/* Jefe de Grupo Assignment (only for Abogados) */}
              {staffRole === "ABOGADO" && (
                <div className="p-4 bg-[var(--surface-2)] border border-[var(--border-glass)] rounded-sm space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] mb-1.5 block">
                    Jefe de Grupo Responsable
                  </label>
                  <p className="text-[9px] text-[var(--text-muted)] mb-2">
                    Selecciona bajo qué Jefe de Grupo operará este abogado (ej: el Jefe de Tributario, el Jefe de Penal, etc.)
                  </p>
                  <div className="relative">
                    <select
                      required
                      value={staffData.managedById}
                      onChange={(e) => setStaffData({ ...staffData, managedById: e.target.value })}
                      className="w-full text-sm border border-[var(--border-glass)] rounded-sm px-4 py-2.5 outline-none focus:border-[var(--gold)] transition-all appearance-none bg-[var(--surface)] pr-10"
                      disabled={isPending}
                    >
                      <option value="">Selecciona un Jefe de Grupo...</option>
                      {jefes.map((j) => (
                        <option key={j.id} value={j.id}>{j.fullName}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  {jefes.length === 0 && (
                    <p className="text-[9px] text-orange-600 font-bold uppercase tracking-widest mt-1">
                      ⚠ No hay Jefes de Mesa registrados. Crea uno primero.
                    </p>
                  )}
                </div>
              )}

              {/* Common fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5 block">Nombre Completo</label>
                  <input
                    type="text"
                    required
                    value={staffData.fullName}
                    onChange={(e) => setStaffData({...staffData, fullName: e.target.value})}
                    placeholder={staffRole === "JEFE_DE_MESA" ? "Ej: Ricardo Fuentes" : "Ej: María López"}
                    className="w-full text-sm border border-[var(--border-glass)] rounded-sm px-4 py-2 outline-none focus:border-[var(--gold)]"
                    disabled={isPending}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5 block">Email Institucional</label>
                  <input
                    type="email"
                    required
                    value={staffData.email}
                    onChange={(e) => setStaffData({...staffData, email: e.target.value})}
                    className="w-full text-sm border border-[var(--border-glass)] rounded-sm px-4 py-2 outline-none focus:border-[var(--gold)]"
                    disabled={isPending}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5 block">Teléfono / WhatsApp</label>
                  <input
                    type="text"
                    required
                    value={staffData.phone}
                    onChange={(e) => setStaffData({...staffData, phone: e.target.value})}
                    className="w-full text-sm border border-[var(--border-glass)] rounded-sm px-4 py-2 outline-none focus:border-[var(--gold)]"
                    disabled={isPending}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5 block">Contraseña Temporal</label>
                  <input
                    type="password"
                    required
                    value={staffData.password}
                    onChange={(e) => setStaffData({...staffData, password: e.target.value})}
                    className="w-full text-sm border border-[var(--border-glass)] rounded-sm px-4 py-2 outline-none focus:border-[var(--gold)]"
                    disabled={isPending}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending || (staffRole === "ABOGADO" && !staffData.managedById)}
                className={`w-full text-[var(--gold)] text-xs font-bold uppercase tracking-[0.2em] py-3.5 rounded-sm transition-colors disabled:opacity-50 mt-2 ${
                  staffRole === "JEFE_DE_MESA"
                    ? "bg-[var(--bg)] hover:bg-[var(--bg-deep)]"
                    : "bg-[#1e3a8a] hover:bg-blue-900"
                }`}
              >
                {isPending
                  ? "Creando Credenciales..."
                  : staffRole === "JEFE_DE_MESA"
                    ? "Habilitar Acceso Jefe de Grupo"
                    : "Habilitar Acceso Abogado"
                }
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-[var(--surface-3)] border border-[var(--border-glass)] border-dashed rounded-sm p-12 flex flex-col items-center justify-center text-center opacity-60">
             <AlertCircle className="w-8 h-8 text-slate-300 mb-3" />
             <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Gestión de Staff Restringida</h4>
             <p className="text-[11px] text-slate-400 mt-1">Solo el Super Admin puede registrar nuevos miembros del equipo.</p>
          </div>
        )}
      </div>
    </div>
  );
}
