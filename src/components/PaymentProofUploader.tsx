"use client";

import { useState, useRef, useTransition } from "react";
import { Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { uploadPaymentProof } from "@/app/portal/actions-payment";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]);
const MAX_BYTES = 8 * 1024 * 1024;

type Status =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function PaymentProofUploader({ caseId }: { caseId: string }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  function reset() {
    setFileName(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStatus({ kind: "idle" });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setStatus({ kind: "error", message: "Selecciona un archivo primero." });
      return;
    }
    if (!ALLOWED.has(file.type)) {
      setStatus({ kind: "error", message: "Solo se aceptan imágenes (JPG, PNG, WEBP, HEIC) o PDF." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus({ kind: "error", message: "El archivo supera los 8 MB." });
      return;
    }

    const fd = new FormData();
    fd.append("file", file);

    setStatus({ kind: "uploading" });
    startTransition(async () => {
      const res = await uploadPaymentProof(caseId, fd);
      if (res.ok) {
        setStatus({ kind: "success", message: res.message });
        reset();
      } else {
        setStatus({ kind: "error", message: res.reason });
      }
    });
  }

  if (status.kind === "success") {
    return (
      <div className="mt-4 p-4 rounded bg-[#10B98115] border border-[#10B98140] flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-[#34D399] mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-[#34D399] mb-1">
            Comprobante recibido
          </p>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">{status.message}</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 p-4 rounded bg-[var(--bg)]/50 border border-[var(--border-subtle)]">
      <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3">
        ¿Ya realizaste tu pago? Sube tu comprobante aquí:
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={onChange}
          disabled={status.kind === "uploading"}
          className="text-[10px] text-[var(--text-muted)] file:bg-[#1e3a8a] file:text-[var(--gold)] file:border-none file:px-3 file:py-1.5 file:rounded file:text-[10px] file:font-bold file:uppercase file:tracking-widest file:cursor-pointer hover:file:bg-blue-700 transition-all disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={status.kind === "uploading" || !fileName}
          className="bg-[var(--gold)] text-[var(--text)] text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded hover:bg-[#D4B85C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {status.kind === "uploading" ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Subiendo...
            </>
          ) : (
            <>
              <Upload className="w-3 h-3" />
              Informar Pago
            </>
          )}
        </button>
      </div>
      <p className="mt-2 text-[10px] text-[var(--text-muted)]">
        Imagen (JPG, PNG, WEBP, HEIC) o PDF · máx. 8 MB
      </p>
      {status.kind === "error" && (
        <div className="mt-3 flex items-start gap-2 text-[#F87171]">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span className="text-[11px]">{status.message}</span>
        </div>
      )}
    </form>
  );
}
