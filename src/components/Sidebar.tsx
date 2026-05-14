"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Activity, AlertCircle, BarChart3, Clock, Folder, Inbox, KeyRound, MessageSquare, Shield, Timer, TrendingUp, Menu, X } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const [isOpen, setIsOpen] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsLargeScreen(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsLargeScreen(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { href: "/admin/bandeja", label: "Bandeja de Entrada", icon: Inbox },
    { href: "/admin/casos", label: "Mis Casos", icon: Folder },
    { href: "/admin/productividad/horas", label: "Mis Horas", icon: Clock },
    { href: "/admin/mensajeria", label: "Mensajeria", icon: MessageSquare },
  ];

  if (role === "SUPER_ADMIN") {
    items.push({ href: "/admin/productividad", label: "Control de Gestion", icon: TrendingUp });
    items.push({ href: "/admin/mora", label: "Gestion de Mora", icon: AlertCircle });
  }

  if (role === "SUPER_ADMIN" || role === "JEFE_DE_MESA") {
    items.push({ href: "/admin/metricas", label: "Metricas de Operacion", icon: BarChart3 });
    items.push({ href: "/admin/equipo", label: "Gestion de Equipo", icon: Shield });
  }

  if (role === "SUPER_ADMIN") {
    items.push({ href: "/admin/productividad/sesiones", label: "Sesiones de Cronómetro", icon: Timer });
    items.push({ href: "/admin/monitoreo", label: "Monitor del Sistema", icon: Activity });
    items.push({ href: "/admin/credenciales", label: "Credenciales", icon: KeyRound });
  }

  const sidebarBody = (
    <>
      <div className="px-6 py-6 border-b flex items-center justify-between" style={{ borderColor: "var(--sidebar-border)" }}>
        <div
          className="rounded-lg p-2 flex items-center justify-center"
          style={{ background: "#FFFFFF", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
        >
          <BrandMark size="sm" />
        </div>
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setIsOpen(false)}
          className="lg:hidden transition-colors"
          style={{ color: "var(--sidebar-text-muted)" }}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="text-[9px] uppercase tracking-widest px-3 mb-2" style={{ color: "var(--sidebar-text-muted)" }}>
          Operacion
        </div>
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all duration-150"
              style={{
                color: active ? "var(--gold)" : "var(--sidebar-text-muted)",
                background: active ? "var(--gold-dim)" : "transparent",
                borderLeft: active ? "2px solid var(--gold)" : "2px solid transparent",
              }}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
        <div className="text-[9px] uppercase tracking-widest" style={{ color: "var(--sidebar-text-muted)" }}>
          v3.0 · Legal OS
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button (top-left, only on small screens) */}
      <button
        type="button"
        aria-label="Abrir menú"
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-30 p-2 rounded-md"
        style={{ background: "var(--surface)", border: "1px solid var(--border-glass)", color: "var(--text)" }}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Backdrop on mobile when open */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar — drawer on mobile, fixed on desktop */}
      {(() => {
        const asideProps: React.HTMLAttributes<HTMLElement> = {
          className: `fixed lg:fixed top-0 left-0 z-50 h-screen w-64 flex flex-col transform transition-transform duration-200 ease-out ${
            isOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0`,
          style: { background: "var(--sidebar-bg)", borderRight: "1px solid var(--sidebar-border)" },
          "aria-hidden": !isOpen && !isLargeScreen,
        };
        return <aside {...asideProps}>{sidebarBody}</aside>;
      })()}
    </>
  );
}
