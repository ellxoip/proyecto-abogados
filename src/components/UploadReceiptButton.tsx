"use client";

import { useTransition, useRef } from "react";
import { Upload, Loader2 } from "lucide-react";
import { uploadReceipt } from "@/app/portal/actions-storage";

export function UploadReceiptButton({ caseId }: { caseId: string }) {
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.append("receipt", file);

      const res = await uploadReceipt(caseId, formData);
      if (res.ok) {
        alert("Comprobante subido exitosamente. Nuestro equipo lo revisará a la brevedad.");
      } else {
        alert(`Error: ${res.error}`);
      }
      
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    });
  };

  return (
    <>
      <input 
        type="file" 
        accept="image/*,.pdf" 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleFileChange}
      />
      <button 
        onClick={() => fileInputRef.current?.click()}
        disabled={isPending}
        className="flex items-center justify-center gap-2 bg-[var(--gold)] hover:bg-[#D4B85C] text-[var(--text)] px-6 py-3 rounded font-bold text-xs uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Subiendo comprobante...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Subir comprobante de pago
          </>
        )}
      </button>
    </>
  );
}
