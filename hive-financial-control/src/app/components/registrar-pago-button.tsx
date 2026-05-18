"use client";

import { useState, useTransition } from "react";
import { registrarPagoAction } from "@/app/cuotas/[contratoId]/actions";

type PortalInfo = {
  portal_url: string;
  rut: string;
  email: string | null;
  telefono: string | null;
  nombre: string;
  password: string;
  whatsapp_url: string | null;
  message: string;
};

export function RegistrarPagoButton({ contratoId }: { contratoId: number }) {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<PortalInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleClick() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        const result = await registrarPagoAction(contratoId);
        setInfo(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al obtener datos.");
      }
    });
  }

  function handleCopy() {
    if (!info) return;
    navigator.clipboard.writeText(info.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Cargando..." : "Registrar pago"}
      </button>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {info && (
        <div className="space-y-2 rounded-md border border-[var(--border)] bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-700">Acceso PagaCuotas para {info.nombre}</p>

          <div className="flex items-center gap-2">
            <input
              readOnly
              value={info.portal_url}
              className="flex-1 rounded border border-[var(--border)] bg-white px-2 py-1 text-xs font-mono text-slate-600"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="whitespace-nowrap rounded border border-[var(--border)] px-2 py-1 text-xs"
            >
              {copied ? "Copiado" : "Copiar mensaje"}
            </button>
          </div>

          <div className="space-y-0.5 text-xs text-slate-500">
            <p>
              <span className="font-medium">RUT:</span> {info.rut}
            </p>
            <p>
              <span className="font-medium">Clave temporal:</span>{" "}
              <span className="font-mono">{info.password}</span>
            </p>
            {info.email && (
              <p>
                <span className="font-medium">Email:</span> {info.email}
              </p>
            )}
            {info.telefono ? (
              <p>
                <span className="font-medium">WhatsApp:</span> {info.telefono}
              </p>
            ) : (
              <p className="text-amber-600">
                Sin telefono registrado: copia el mensaje y envialo manualmente.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {info.whatsapp_url && (
              <a
                href={info.whatsapp_url}
                target="_blank"
                rel="noreferrer"
                className="inline-block rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
              >
                Enviar por WhatsApp
              </a>
            )}
            <a
              href={info.portal_url}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded border border-[var(--border)] px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              Abrir portal
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
