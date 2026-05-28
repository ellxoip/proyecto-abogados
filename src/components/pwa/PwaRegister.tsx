"use client";

import { useEffect } from "react";

/**
 * Registra el service worker (/sw.js) una vez cargada la página.
 * Falla en silencio si el navegador no soporta SW o el registro falla:
 * la app sigue funcionando como web normal.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* no-op: PWA opcional, no debe romper la app */
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
