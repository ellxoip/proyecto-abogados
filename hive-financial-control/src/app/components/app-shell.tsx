"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { LogoutButton } from "./logout-button";

type LeafItem = {
  label: string;
  href?: string;
};

type GroupItem = {
  label: string;
  items: LeafItem[];
};

type MenuItem = LeafItem | GroupItem;

type MenuSection = {
  label: string;
  href?: string;
  items?: MenuItem[];
};

function isGroup(item: MenuItem): item is GroupItem {
  return "items" in item;
}

const menu: MenuSection[] = [
  { label: "Dashboard", href: "/dashboard" },
  {
    label: "Clientes",
    items: [
      { label: "Clientes", href: "/clientes" },
      { label: "Deudores", href: "/clientes/deudores" },
      { label: "Contratos", href: "/contratos" },
      { label: "Importar", href: "/admin/importaciones/clientes" },
    ],
  },
  {
    label: "Cobranza",
    items: [
      { label: "Cuotas", href: "/cuotas" },
      { label: "Pagos", href: "/pagos" },
      { label: "Morosidad", href: "/cobranza/morosidad" },
      { label: "Compromisos", href: "/compromisos" },
      { label: "Gestiones", href: "/gestiones" },
      { label: "Plantillas", href: "/gestiones/plantillas" },
    ],
  },
  {
    label: "Tesorería",
    items: [
      { label: "Resumen", href: "/tesoreria" },
      { label: "Bancos", href: "/tesoreria/bancos" },
      { label: "Cuentas", href: "/tesoreria/cuentas" },
      { label: "Movimientos", href: "/tesoreria/movimientos" },
      { label: "Egresos", href: "/tesoreria/egresos" },
      { label: "Flujo de caja", href: "/tesoreria/flujo-caja" },
      { label: "Conciliación", href: "/tesoreria/conciliacion" },
      {
        label: "Caja chica",
        items: [
          { label: "Resumen", href: "/tesoreria/caja-chica" },
          { label: "Fondos", href: "/tesoreria/caja-chica/fondos" },
          { label: "Gastos", href: "/tesoreria/caja-chica/gastos" },
          { label: "Rendiciones", href: "/tesoreria/caja-chica/rendiciones" },
          { label: "Reposiciones", href: "/tesoreria/caja-chica/reposiciones" },
        ],
      },
    ],
  },
  {
    label: "Ventas",
    items: [
      { label: "Documentos", href: "/ventas/documentos" },
      { label: "Boletas", href: "/ventas/boletas" },
      { label: "Facturas exentas", href: "/ventas/facturas" },
      { label: "Notas de crédito", href: "/ventas/notas-credito" },
      { label: "Comprobantes", href: "/ventas/comprobantes" },
      { label: "Servicios", href: "/ventas/servicios" },
      { label: "Facturación recurrente", href: "/ventas/recurrente" },
    ],
  },
  {
    label: "Compras",
    items: [
      { label: "Proveedores", href: "/compras/proveedores" },
      { label: "Gastos", href: "/compras/gastos" },
      { label: "Documentos", href: "/compras/documentos" },
      { label: "Honorarios", href: "/compras/honorarios" },
      { label: "Cuentas por pagar", href: "/compras/cuentas-por-pagar" },
    ],
  },
  {
    label: "Contabilidad",
    items: [
      { label: "Plan de cuentas", href: "/contabilidad/plan-cuentas" },
      { label: "Comprobantes", href: "/contabilidad/comprobantes" },
      { label: "Libro diario", href: "/contabilidad/libro-diario" },
      { label: "Libro mayor", href: "/contabilidad/libro-mayor" },
      { label: "Ficha contable", href: "/contabilidad/ficha-contable" },
      { label: "Ajustes", href: "/contabilidad/ajustes" },
      { label: "Balance 8 columnas", href: "/contabilidad/balance" },
      { label: "Estado de resultados", href: "/contabilidad/estado-resultados" },
      { label: "Cierres", href: "/contabilidad/cierres" },
      { label: "Tipos comprobante", href: "/contabilidad/tipos-comprobante" },
    ],
  },
  {
    label: "Reportes",
    items: [
      {
        label: "Contabilidad",
        items: [
          { label: "Pagos recibidos", href: "/reportes/pagos" },
          { label: "Cuentas por cobrar", href: "/reportes/cxc" },
          { label: "Vencimientos", href: "/reportes/vencimientos" },
          { label: "Morosidad", href: "/reportes/morosidad" },
          { label: "Proyección de caja", href: "/reportes/proyeccion" },
        ],
      },
      {
        label: "Cobranza",
        items: [
          { label: "Efectividad cobranza", href: "/reportes/efectividad-cobranza" },
          { label: "Compromisos de pago", href: "/reportes/compromisos" },
          { label: "Gestiones realizadas", href: "/reportes/gestiones" },
        ],
      },
      {
        label: "Clientes",
        items: [
          { label: "Clientes nuevos", href: "/reportes/clientes-nuevos" },
          { label: "Distribución", href: "/reportes/distribucion-clientes" },
          { label: "Retención", href: "/reportes/retencion" },
          { label: "LTV clientes", href: "/reportes/ltv" },
        ],
      },
      {
        label: "Contratos",
        items: [
          { label: "Cartera servicios", href: "/reportes/cartera-servicios" },
          { label: "Modificaciones", href: "/reportes/modificaciones" },
          { label: "Condonaciones", href: "/reportes/condonaciones" },
          { label: "Casos legales", href: "/reportes/casos-legales" },
          { label: "Cuotas vs casos", href: "/reportes/cuotas-casos" },
        ],
      },
      {
        label: "Ventas",
        items: [
          { label: "Documentos emitidos", href: "/reportes/ventas/documentos" },
          { label: "Venta por servicio", href: "/reportes/ventas/por-servicio" },
          { label: "Libro de ventas", href: "/reportes/ventas/libro" },
        ],
      },
      {
        label: "Compras",
        items: [
          { label: "Documentos recibidos", href: "/reportes/compras/documentos" },
          { label: "Gastos por categoría", href: "/reportes/compras/gastos" },
          { label: "Libro de compras", href: "/reportes/compras/libro" },
          { label: "Cuentas por pagar", href: "/reportes/compras/cxp" },
        ],
      },
      {
        label: "Tesorería",
        items: [
          { label: "Flujo de caja real", href: "/reportes/tesoreria/flujo" },
          { label: "Saldos bancarios", href: "/reportes/tesoreria/saldos" },
          { label: "Conciliación", href: "/reportes/tesoreria/conciliacion" },
        ],
      },
      {
        label: "Caja chica",
        items: [
          { label: "Gastos por fondo", href: "/reportes/caja-chica/gastos" },
          { label: "Rendiciones", href: "/reportes/caja-chica/rendiciones" },
        ],
      },
      { label: "Historial", href: "/reportes/historial" },
      { label: "Auditoría", href: "/reportes/auditoria" },
    ],
  },
  {
    label: "BI y Análisis",
    items: [
      { label: "Dashboard ejecutivo", href: "/bi" },
      { label: "Indicadores financieros", href: "/bi/financieros" },
      { label: "Indicadores cobranza", href: "/bi/cobranza" },
      { label: "Por abogado", href: "/bi/abogados" },
      { label: "Por cliente", href: "/bi/clientes" },
      { label: "Por contrato", href: "/bi/contratos" },
      { label: "Rentabilidad por caso", href: "/bi/rentabilidad" },
    ],
  },
  {
    label: "Configuración",
    items: [
      { label: "Empresa", href: "/configuracion/empresa" },
      { label: "Usuarios", href: "/configuracion/usuarios" },
      { label: "Permisos", href: "/configuracion/permisos" },
      { label: "Parámetros", href: "/configuracion/parametros" },
      { label: "Tipos documentos", href: "/configuracion/tipos-documentos" },
      { label: "Tipos comprobantes", href: "/configuracion/tipos-comprobantes" },
      { label: "Condiciones de pago", href: "/configuracion/condiciones-pago" },
      { label: "Impuestos", href: "/configuracion/impuestos" },
      { label: "Bancos y cuentas", href: "/configuracion/bancos" },
      { label: "Tipos movimiento", href: "/configuracion/tipos-movimiento" },
      { label: "Categorías de gastos", href: "/configuracion/categorias-gastos" },
      { label: "Caja chica", href: "/configuracion/caja-chica" },
      { label: "Plantillas docs", href: "/configuracion/plantillas" },
      { label: "Cartas cobranza", href: "/configuracion/cartas-cobranza" },
      { label: "Integraciones", href: "/configuracion/integraciones" },
    ],
  },
  {
    label: "Administración",
    items: [
      { label: "Empresas", href: "/administracion/empresas" },
      { label: "Usuarios globales", href: "/administracion/usuarios" },
      { label: "Seguridad", href: "/administracion/seguridad" },
      { label: "Auditoría sistema", href: "/administracion/auditoria" },
    ],
  },
];

function isPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function leafIsActive(pathname: string, item: LeafItem) {
  return item.href ? isPathActive(pathname, item.href) : false;
}

function groupIsActive(pathname: string, items: LeafItem[]) {
  return items.some((i) => leafIsActive(pathname, i));
}

function sectionIsActive(pathname: string, section: MenuSection) {
  if (section.href && isPathActive(pathname, section.href)) return true;
  return section.items?.some((item) =>
    isGroup(item) ? groupIsActive(pathname, item.items) : leafIsActive(pathname, item),
  ) ?? false;
}

function SubGroup({ group, pathname, depth }: { group: GroupItem; pathname: string; depth: number }) {
  const active = groupIsActive(pathname, group.items);
  const pl = depth === 1 ? "pl-8" : "pl-10";
  const itemPl = depth === 1 ? "pl-10" : "pl-12";

  return (
    <details className="group/sub" open={active}>
      <summary
        className={`flex cursor-pointer list-none items-center justify-between rounded-md ${pl} py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 ${
          active ? "text-white" : "text-white/60"
        }`}
      >
        <span>{group.label}</span>
        <span className="pr-2 text-[10px] text-white/40 transition-transform group-open/sub:rotate-180">v</span>
      </summary>
      <div className="mt-0.5 space-y-0.5">
        {group.items.map((item) =>
          item.href ? (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md ${itemPl} py-1.5 text-sm hover:bg-white/10 ${
                leafIsActive(pathname, item) ? "bg-white/10 text-white" : "text-white/70"
              }`}
            >
              {item.label}
            </Link>
          ) : (
            <p key={item.label} className={`${itemPl} py-1.5 text-sm text-white/35`}>
              {item.label}
            </p>
          ),
        )}
      </div>
    </details>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[260px_1fr]">
      <aside className="border-r border-[var(--border)] bg-[#12212f] text-white">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-xs uppercase tracking-wide text-white/70">Panel Interno</p>
          <h1 className="text-lg font-semibold">Legal Finance MVP</h1>
        </div>
        <nav className="space-y-1 overflow-y-auto p-4">
          {menu.map((section) => (
            <div key={section.label}>
              {section.items?.length ? (
                <details className="group" open={sectionIsActive(pathname, section)}>
                  <summary
                    className={`flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-white/10 ${
                      sectionIsActive(pathname, section) ? "bg-white/10 text-white" : "text-white/90"
                    }`}
                  >
                    <span>{section.label}</span>
                    <span className="text-xs text-white/60 transition-transform group-open:rotate-180">v</span>
                  </summary>

                  <div className="mt-1 space-y-0.5">
                    {section.href && (
                      <Link
                        href={section.href}
                        className={`block rounded-md px-6 py-1.5 text-sm hover:bg-white/10 ${
                          isPathActive(pathname, section.href) ? "bg-white/10 text-white" : "text-white/80"
                        }`}
                      >
                        {section.label}
                      </Link>
                    )}

                    {section.items.map((item) =>
                      isGroup(item) ? (
                        <SubGroup key={item.label} group={item} pathname={pathname} depth={1} />
                      ) : item.href ? (
                        <Link
                          key={`${section.label}-${item.label}`}
                          href={item.href}
                          className={`block rounded-md px-6 py-1.5 text-sm hover:bg-white/10 ${
                            leafIsActive(pathname, item) ? "bg-white/10 text-white" : "text-white/80"
                          }`}
                        >
                          {item.label}
                        </Link>
                      ) : (
                        <p
                          key={`${section.label}-${item.label}`}
                          className="px-6 py-1.5 text-sm text-white/45"
                        >
                          {item.label}
                        </p>
                      ),
                    )}
                  </div>
                </details>
              ) : section.href ? (
                <Link
                  href={section.href}
                  className={`block rounded-md px-3 py-2 text-sm font-medium hover:bg-white/10 ${
                    isPathActive(pathname, section.href) ? "bg-white/10 text-white" : "text-white/90"
                  }`}
                >
                  {section.label}
                </Link>
              ) : (
                <p className="px-3 py-2 text-sm font-medium text-white/90">{section.label}</p>
              )}
            </div>
          ))}
          <LogoutButton />
        </nav>
      </aside>
      <main className="p-5 md:p-8">{children}</main>
    </div>
  );
}
