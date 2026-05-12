"use client";

import { useState, useRef, useTransition } from "react";
import { uploadDocumentAndUpdate } from "./upload-actions";
import { Send, Paperclip, FileText, X, Loader2, CheckCircle } from "lucide-react";

export function UpdateForm({ caseId, disabled }: { caseId: string; disabled?: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    if (file) formData.set("document", file);

    startTransition(async () => {
      const res = await uploadDocumentAndUpdate(caseId, formData);
      if (res.ok) {
        setSuccess(true);
        setFile(null);
        formRef.current?.reset();
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(res.error || "Error desconocido");
      }
    });
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md shadow-sm overflow-hidden">
      <div className="px-6 py-3 border-b border-[var(--border-glass)] bg-[var(--surface-2)]">
        <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--gold)]">
          Registrar Avance del Caso
        </span>
      </div>
      <form ref={formRef} onSubmit={handleSubmit} className="p-6 space-y-4">
        <textarea
          name="description"
          placeholder="Describa el avance: próximos pasos, documentación entregada, resultado de gestiones..."
          className="w-full h-28 p-4 text-sm border border-[var(--border-glass)] rounded-md outline-none focus:border-[var(--gold)] transition-colors resize-none bg-[var(--surface)] text-[var(--text)]"
          disabled={disabled || isPending}
          required
        />

        {/* File attachment zone */}
        {file ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-md" style={{ background: "rgba(201, 168, 76, 0.08)", border: "1px solid rgba(201, 168, 76, 0.2)" }}>
            <FileText size={16} className="text-[var(--gold)] flex-shrink-0" />
            <span className="text-xs font-semibold text-[var(--text)] truncate flex-1">{file.name}</span>
            <span className="text-[10px] text-[var(--text-muted)]">{(file.size / 1024).toFixed(0)} KB</span>
            <button type="button" onClick={() => setFile(null)} className="text-[var(--text-muted)] hover:text-[var(--red)] transition-colors">
              <X size={14} />
            </button>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isPending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-md text-[10px] font-bold uppercase tracking-widest border transition-colors hover:bg-[var(--surface-2)] disabled:opacity-40"
              style={{ borderColor: "var(--border-glass)", color: "var(--text-muted)" }}
              title="Formatos: PDF, Word, Excel, JPG, PNG, WebP, TXT (máx. 25 MB)"
            >
              <Paperclip className="w-3.5 h-3.5" />
              Adjuntar Documento
            </button>
            <span className="text-[9px] uppercase tracking-widest hidden md:inline" style={{ color: "var(--text-dim)" }}>
              PDF · Word · Excel · JPG · PNG · 25 MB max
            </span>
          </div>

          <button
            type="submit"
            disabled={disabled || isPending}
            className="flex items-center gap-2 px-6 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
            style={{ background: "var(--bg)", color: "var(--gold)" }}
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            {isPending ? "Publicando..." : "Publicar e Informar"}
          </button>
        </div>

        {error && (
          <div className="text-[10px] text-[var(--red)] font-bold">{error}</div>
        )}
        {success && (
          <div className="flex items-center gap-2 text-xs font-bold" style={{ color: "#10B981" }}>
            <CheckCircle size={14} />
            Actualización registrada y notificada al cliente
          </div>
        )}
      </form>
    </div>
  );
}
