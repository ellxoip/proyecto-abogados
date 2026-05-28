"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Botón flotante "Instalar app" para el login.
 * - Android/Chrome/Edge: captura `beforeinstallprompt` y dispara el prompt nativo.
 * - iOS/Safari (sin beforeinstallprompt): muestra instrucciones para "Agregar a inicio".
 * - Si la app ya corre instalada (standalone) o ya se instaló: no muestra nada.
 */
export default function InstallAppButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    setIsIos(/iphone|ipad|ipod/.test(ua) && !/crios|fxios/.test(ua) ? true : /iphone|ipad|ipod/.test(ua));

    const standaloneNow =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setStandalone(Boolean(standaloneNow));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone || installed) return null;
  // Si no hay prompt nativo disponible y no es iOS, no hay forma de instalar → ocultar.
  if (!deferred && !isIos) return null;

  async function handleClick() {
    if (deferred) {
      await deferred.prompt();
      try {
        await deferred.userChoice;
      } catch {
        /* ignore */
      }
      setDeferred(null);
    } else if (isIos) {
      setShowIosHint((v) => !v);
    }
  }

  return (
    <div className="fixed right-3 top-3 z-50 flex flex-col items-end sm:right-4 sm:top-4">
      <button
        type="button"
        onClick={handleClick}
        aria-label="Instalar aplicación"
        className="inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-[#26235C] shadow-lg ring-1 ring-black/10 backdrop-blur transition hover:bg-white active:scale-95"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
        Instalar app
      </button>
      {showIosHint && (
        <div className="mt-2 max-w-[240px] rounded-xl bg-white/95 p-3 text-[12px] leading-snug text-[#1F2A44] shadow-xl ring-1 ring-black/10">
          En iPhone/iPad: toca el botón <b>Compartir</b> (cuadro con flecha ↑) en
          Safari y elige <b>“Agregar a pantalla de inicio”</b>.
        </div>
      )}
    </div>
  );
}
