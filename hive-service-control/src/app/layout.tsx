import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "HIVE CONTROL — Sistema de Gestión de Procesos Legales",
  description: "Legal Operating System (LOS) — Gestión de casos, abogados y pagos",
  icons: {
    icon: [
      { url: "/brand/hive-control-logo.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: "/brand/hive-control-logo.svg",
    shortcut: "/brand/hive-control-logo.svg",
  },
};

// Aplica el tema guardado en localStorage antes del primer paint para evitar
// flash del tema por defecto (GestionLegal Light) cuando el usuario eligió dark.
const NO_FLASH_THEME_SCRIPT = `(function(){try{var raw=localStorage.getItem('hive-control-config');if(!raw)return;var saved=JSON.parse(raw);if(saved&&saved.theme==='LemonKiller Dark'){document.documentElement.setAttribute('data-config-theme','dark');}}catch(_){} })();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
