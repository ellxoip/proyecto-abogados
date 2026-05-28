import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import PwaRegister from "@/components/pwa/PwaRegister";

export const metadata: Metadata = {
  title: "HIVE CONTROL — Sistema de Gestión de Procesos Legales",
  description: "Legal Operating System (LOS) — Gestión de casos, abogados y pagos",
  applicationName: "HIVE CONTROL",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HIVE CONTROL",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/brand/hive-control-logo.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
    shortcut: "/brand/hive-control-logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#26235C",
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
        <PwaRegister />
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
