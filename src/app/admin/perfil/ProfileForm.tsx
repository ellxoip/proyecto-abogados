"use client";

import { useState } from "react";
import { updateProfile } from "./profile-actions";
import { User, Mail, Shield, Lock, Save, Loader2, CheckCircle } from "lucide-react";

interface ProfileFormProps {
  initialData: {
    fullName: string;
    email: string;
    role: string;
  };
}

export function ProfileForm({ initialData }: ProfileFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    const res = await updateProfile(formData);

    setLoading(false);
    if (res.success) {
      setSuccess(true);
      // Ocultar éxito después de 3 segundos
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setError(res.error || "Error desconocido");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-8 space-y-6">
      {/* Role Badge */}
      <div className="flex justify-end">
        <div 
          className="flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
          style={{ background: "rgba(201, 168, 76, 0.1)", color: "var(--gold)", border: "1px solid rgba(201, 168, 76, 0.2)" }}
        >
          <Shield size={12} />
          {initialData.role}
        </div>
      </div>

      <div className="space-y-4">
        {/* Name */}
        <div className="space-y-2">
          <label className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text)" }}>
            <User size={16} className="text-[var(--gold)]" />
            Nombre Completo
          </label>
          <input
            name="fullName"
            defaultValue={initialData.fullName}
            required
            className="w-full px-4 py-3 rounded-lg text-sm transition-all duration-200 focus:outline-none focus:ring-2"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border-glass)", color: "var(--text)" }}
          />
        </div>

        {/* Email */}
        <div className="space-y-2">
          <label className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text)" }}>
            <Mail size={16} className="text-[var(--gold)]" />
            Correo Electrónico
          </label>
          <input
            name="email"
            type="email"
            defaultValue={initialData.email}
            required
            className="w-full px-4 py-3 rounded-lg text-sm transition-all duration-200 focus:outline-none focus:ring-2"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border-glass)", color: "var(--text)" }}
          />
        </div>

        <div className="pt-4 border-t" style={{ borderColor: "var(--border-glass)" }}>
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: "var(--text)" }}>
            <Lock size={16} className="text-[var(--gold)]" />
            Cambiar Contraseña
          </h3>
          <div className="space-y-2">
            <label className="text-xs" style={{ color: "var(--text-muted)" }}>
              Nueva Contraseña (dejar en blanco para mantener la actual)
            </label>
            <input
              name="password"
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-lg text-sm transition-all duration-200 focus:outline-none focus:ring-2"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border-glass)", color: "var(--text)" }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg text-xs font-semibold" style={{ background: "var(--red-dim)", color: "var(--red)", border: "1px solid var(--red-border)" }}>
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 rounded-lg text-xs font-semibold flex items-center gap-2" style={{ background: "rgba(16, 185, 129, 0.1)", color: "#10B981", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
          <CheckCircle size={14} />
          ¡Perfil actualizado con éxito!
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, var(--gold) 0%, #F5E9C8 100%)", color: "var(--text)" }}
      >
        {loading ? (
          <Loader2 className="animate-spin" size={20} />
        ) : (
          <>
            <Save size={20} />
            Guardar Cambios
          </>
        )}
      </button>
    </form>
  );
}
