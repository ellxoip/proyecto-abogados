"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, AlertCircle } from "lucide-react";

export default function MagicLinkConsumer({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"working" | "error">("working");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await signIn("magic-link", { token, redirect: false });
        if (cancelled) return;
        if (!result || result.error) {
          setStatus("error");
          setErrorMsg("El enlace expiró o no es válido. Inicia sesión con tu RUT y clave.");
          return;
        }
        router.replace("/portal");
      } catch {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg("No se pudo abrir tu sesión. Intenta nuevamente.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div
        className="w-full max-w-md rounded-lg p-8 shadow-2xl text-center"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--gold-border)",
          borderLeft: "3px solid var(--gold)",
        }}
      >
        {status === "working" ? (
          <>
            <Loader2 className="w-8 h-8 mx-auto animate-spin" style={{ color: "var(--gold)" }} />
            <h1
              className="mt-4 text-lg font-bold"
              style={{ color: "var(--text)", fontFamily: "'Playfair Display', serif" }}
            >
              Abriendo tu portal…
            </h1>
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
              Confirmamos tu pago. Te estamos llevando al seguimiento de tu caso.
            </p>
          </>
        ) : (
          <>
            <AlertCircle className="w-8 h-8 mx-auto" style={{ color: "#e26d76" }} />
            <h1
              className="mt-4 text-lg font-bold"
              style={{ color: "var(--text)", fontFamily: "'Playfair Display', serif" }}
            >
              No pudimos validar el enlace
            </h1>
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
              {errorMsg}
            </p>
            <a
              href="/login"
              className="inline-flex items-center justify-center mt-4 px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest"
              style={{
                background: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
                border: "1px solid var(--gold-border)",
                color: "#FFFFFF",
              }}
            >
              Ir a iniciar sesión
            </a>
          </>
        )}
      </div>
    </div>
  );
}
