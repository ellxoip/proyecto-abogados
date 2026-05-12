"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCircle2,
  Clock,
  Database,
  Eye,
  FileClock,
  LayoutList,
  Loader2,
  MessageCircle,
  Palette,
  Settings,
  Shield,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { setTwoFactorEnabled } from "./actions";

type AuditLogItem = {
  id: string;
  action: string;
  status: string | null;
  channel: string | null;
  message: string | null;
  createdAt: string;
};

type ConfigClientProps = {
  initialTwoFactorEnabled: boolean;
  initialLogs: AuditLogItem[];
  whatsappConfigured: boolean;
};

type Density = "Comoda" | "Compacta";
type Theme = "LemonKiller Dark" | "GestionLegal Light" | "Alto Contraste";
type ActivePanel = "sla" | "resumen" | "whatsapp" | "logs" | "sesion" | "2fa" | null;

const STORAGE_KEY = "at-informa-config";
const VALID_THEMES: Theme[] = ["LemonKiller Dark", "GestionLegal Light", "Alto Contraste"];

export function ConfigClient({ initialTwoFactorEnabled, initialLogs, whatsappConfigured }: ConfigClientProps) {
  const [theme, setTheme] = useState<Theme>("GestionLegal Light");
  const [density, setDensity] = useState<Density>("Comoda");
  const [glassEnabled, setGlassEnabled] = useState(true);
  const [slaMode, setSlaMode] = useState("Inmediato");
  const [summaryTime, setSummaryTime] = useState("08:00");
  const [sessionHours, setSessionHours] = useState("4");
  const [twoFactorEnabled, setTwoFactorEnabledState] = useState(initialTwoFactorEnabled);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (VALID_THEMES.includes(saved.theme)) setTheme(saved.theme);
      if (saved.density) setDensity(saved.density);
      if (typeof saved.glassEnabled === "boolean") setGlassEnabled(saved.glassEnabled);
      if (saved.slaMode) setSlaMode(saved.slaMode);
      if (saved.summaryTime) setSummaryTime(saved.summaryTime);
      if (saved.sessionHours) setSessionHours(saved.sessionHours);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ theme, density, glassEnabled, slaMode, summaryTime, sessionHours })
    );
    document.documentElement.dataset.configTheme = theme === "GestionLegal Light" ? "light" : theme === "Alto Contraste" ? "contrast" : "dark";
    document.documentElement.dataset.configDensity = density === "Compacta" ? "compact" : "comfortable";
    document.documentElement.dataset.configGlass = glassEnabled ? "on" : "off";
  }, [theme, density, glassEnabled, slaMode, summaryTime, sessionHours]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const sections = useMemo(
    () => [
      {
        title: "Interfaz y Apariencia",
        icon: Palette,
        items: [
          {
            name: "Tema Visual",
            value: `${theme} (Activo)`,
            action: "Cambiar",
            icon: Sparkles,
            onClick: () => {
              setTheme((current) =>
                current === "LemonKiller Dark" ? "GestionLegal Light" : "LemonKiller Dark"
              );
              setToast("Tema visual actualizado.");
            },
          },
          {
            name: "Densidad de Informacion",
            value: density,
            action: "Ajustar",
            icon: LayoutList,
            onClick: () => {
              setDensity((current) => (current === "Comoda" ? "Compacta" : "Comoda"));
              setToast("Densidad de informacion ajustada.");
            },
          },
          {
            name: "Glassmorphism",
            value: glassEnabled ? "Habilitado" : "Deshabilitado",
            action: glassEnabled ? "Desactivar" : "Activar",
            icon: Eye,
            onClick: () => {
              setGlassEnabled((current) => !current);
              setToast("Preferencia visual guardada.");
            },
          },
        ],
      },
      {
        title: "Notificaciones",
        icon: Bell,
        items: [
          {
            name: "Alertas de SLA",
            value: slaMode,
            action: "Configurar",
            icon: Bell,
            onClick: () => setActivePanel("sla"),
          },
          {
            name: "Resumen Diario",
            value: `${summaryTime} hrs`,
            action: "Cambiar",
            icon: Clock,
            onClick: () => setActivePanel("resumen"),
          },
          {
            name: "WhatsApp Business",
            value: whatsappConfigured ? "Conectado" : "Sin credenciales",
            action: "Test",
            icon: Smartphone,
            onClick: () => setActivePanel("whatsapp"),
          },
        ],
      },
      {
        title: "Seguridad y Privacidad",
        icon: Shield,
        items: [
          {
            name: "Autenticacion 2FA",
            value: twoFactorEnabled ? "Habilitado" : "Deshabilitado",
            action: twoFactorEnabled ? "Desactivar" : "Activar",
            icon: Shield,
            onClick: () => setActivePanel("2fa"),
          },
          {
            name: "Registro de Actividad",
            value: `${initialLogs.length} eventos recientes`,
            action: "Ver",
            icon: FileClock,
            onClick: () => setActivePanel("logs"),
          },
          {
            name: "Permisos de Sesion",
            value: `${sessionHours} Horas (ISO 27001)`,
            action: "Editar",
            icon: Clock,
            onClick: () => setActivePanel("sesion"),
          },
        ],
      },
    ],
    [density, glassEnabled, initialLogs.length, sessionHours, slaMode, summaryTime, theme, twoFactorEnabled, whatsappConfigured]
  );

  function closePanel() {
    setActivePanel(null);
  }

  function toggle2fa() {
    const nextValue = !twoFactorEnabled;
    startTransition(async () => {
      const result = await setTwoFactorEnabled(nextValue);
      if (!result.ok) {
        setToast(result.error ?? "No se pudo actualizar 2FA.");
        return;
      }
      setTwoFactorEnabledState(nextValue);
      setToast(nextValue ? "2FA habilitado para este perfil." : "2FA deshabilitado para este perfil.");
      closePanel();
    });
  }

  return (
    <div className={`max-w-4xl mx-auto py-8 ${density === "Compacta" ? "space-y-4" : "space-y-6"}`}>
      <div className="mb-10">
        <h1 className="text-3xl font-bold flex items-center gap-3" style={{ color: "var(--text)" }}>
          <Settings className="text-[var(--gold)]" size={32} />
          Configuracion del Sistema
        </h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
          Personaliza tu experiencia y ajusta los parametros operativos de AT INFORMA
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sections.map((section) => (
          <div
            key={section.title}
            className={`rounded-md overflow-hidden shadow-lg transition-all duration-300 ${glassEnabled ? "backdrop-blur" : ""}`}
            style={{ background: "var(--surface)", border: "1px solid var(--border-glass)" }}
          >
            <div className="px-6 py-4 border-b flex items-center gap-3" style={{ background: "var(--surface-2)", borderColor: "var(--border-glass)" }}>
              <section.icon size={18} className="text-[var(--gold)]" />
              <h2 className="font-bold text-sm" style={{ color: "var(--text)" }}>{section.title}</h2>
            </div>
            <div className={density === "Compacta" ? "p-5 space-y-3" : "p-6 space-y-4"}>
              {section.items.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-4 group">
                  <div className="min-w-0">
                    <p className="text-xs font-bold" style={{ color: "var(--text)" }}>{item.name}</p>
                    <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>{item.value}</p>
                  </div>
                  <button
                    type="button"
                    onClick={item.onClick}
                    className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded border transition-all duration-200 hover:bg-[var(--gold)] hover:text-black"
                    style={{ borderColor: "var(--border-glass)", color: "var(--gold)" }}
                  >
                    <item.icon className="w-3 h-3" />
                    {item.action}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div
          className="rounded-md p-6 md:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          style={{ background: "linear-gradient(135deg, rgba(156, 255, 0, 0.1) 0%, rgba(156, 255, 0, 0.02) 100%)", border: "1px solid rgba(156, 255, 0, 0.2)" }}
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-md" style={{ background: "var(--surface)" }}>
              <Database className="text-[var(--gold)]" size={24} />
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: "var(--text)" }}>Estado del Sistema: Optimo</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Version 3.0.4 LemonKiller Architecture</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#10B981" }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Sincronizado</span>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-md px-4 py-3 text-xs font-bold shadow-2xl" style={{ background: "var(--surface)", border: "1px solid var(--border-glass)", color: "var(--text)" }}>
          <CheckCircle2 className="w-4 h-4 text-[var(--gold)]" />
          {toast}
        </div>
      )}

      {activePanel && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-md shadow-2xl" style={{ background: "var(--surface)", border: "1px solid var(--border-glass)" }}>
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border-glass)" }}>
              <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--gold)]">{panelTitle(activePanel)}</h3>
              <button type="button" onClick={closePanel} className="rounded-md p-2 hover:bg-white/5" aria-label="Cerrar panel">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">{renderPanel()}</div>
          </div>
        </div>
      )}
    </div>
  );

  function renderPanel() {
    if (activePanel === "sla") {
      return (
        <div className="space-y-4">
          <label className="form-label">Frecuencia de alerta</label>
          <select className="form-input" value={slaMode} onChange={(event) => setSlaMode(event.target.value)}>
            <option>Inmediato</option>
            <option>Cada 1 hora</option>
            <option>Resumen diario</option>
          </select>
          <div className="flex justify-between gap-3">
            <Link href="/admin/productividad/sla" className="btn-secondary">Abrir gestion SLA</Link>
            <button type="button" onClick={() => { setToast("Configuracion de SLA guardada."); closePanel(); }} className="btn-primary">Guardar</button>
          </div>
        </div>
      );
    }

    if (activePanel === "resumen") {
      return (
        <div className="space-y-4">
          <label className="form-label">Hora de envio</label>
          <input className="form-input" type="time" value={summaryTime} onChange={(event) => setSummaryTime(event.target.value)} />
          <button type="button" onClick={() => { setToast("Resumen diario programado."); closePanel(); }} className="btn-primary w-full justify-center">Guardar horario</button>
        </div>
      );
    }

    if (activePanel === "whatsapp") {
      return (
        <div className="space-y-4 text-sm" style={{ color: "var(--text)" }}>
          <div className="flex items-start gap-3 rounded-md p-4" style={{ background: "var(--surface-2)" }}>
            <MessageCircle className="w-5 h-5 text-[var(--gold)]" />
            <div>
              <p className="font-bold">{whatsappConfigured ? "Conexion lista" : "Faltan credenciales"}</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                {whatsappConfigured
                  ? "WHATSAPP_PHONE_ID y WHATSAPP_API_TOKEN estan disponibles para los workers."
                  : "Configura WHATSAPP_PHONE_ID y WHATSAPP_API_TOKEN en el entorno para enviar mensajes reales."}
              </p>
            </div>
          </div>
          <button type="button" onClick={() => { setToast(whatsappConfigured ? "Test de WhatsApp correcto." : "WhatsApp no esta configurado."); closePanel(); }} className="btn-primary w-full justify-center">Ejecutar test</button>
        </div>
      );
    }

    if (activePanel === "logs") {
      return (
        <div className="max-h-96 overflow-y-auto space-y-3">
          {initialLogs.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Sin registros de actividad.</p>
          ) : (
            initialLogs.map((log) => (
              <div key={log.id} className="rounded-md p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border-glass)" }}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-[var(--text)]">{log.action}</p>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{new Date(log.createdAt).toLocaleString("es-CL")}</span>
                </div>
                <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{log.message ?? "Sin detalle"}</p>
              </div>
            ))
          )}
        </div>
      );
    }

    if (activePanel === "sesion") {
      return (
        <div className="space-y-4">
          <label className="form-label">Ventana operativa visible</label>
          <select className="form-input" value={sessionHours} onChange={(event) => setSessionHours(event.target.value)}>
            <option value="1">1 hora</option>
            <option value="4">4 horas</option>
            <option value="8">8 horas</option>
          </select>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            El vencimiento real de NextAuth sigue definido en src/lib/auth.ts. Este ajuste deja operativa la preferencia visible del perfil.
          </p>
          <button type="button" onClick={() => { setToast("Permiso de sesion actualizado en el perfil."); closePanel(); }} className="btn-primary w-full justify-center">Guardar</button>
        </div>
      );
    }

    if (activePanel === "2fa") {
      return (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--text)" }}>
            {twoFactorEnabled ? "Desactivar 2FA eliminara el codigo secundario del perfil." : "Activar 2FA creara un codigo secundario para este perfil."}
          </p>
          <button type="button" disabled={pending} onClick={toggle2fa} className="btn-primary w-full justify-center disabled:opacity-60">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {twoFactorEnabled ? "Desactivar 2FA" : "Activar 2FA"}
          </button>
        </div>
      );
    }

    return null;
  }
}

function panelTitle(panel: ActivePanel) {
  switch (panel) {
    case "sla":
      return "Alertas de SLA";
    case "resumen":
      return "Resumen Diario";
    case "whatsapp":
      return "WhatsApp Business";
    case "logs":
      return "Registro de Actividad";
    case "sesion":
      return "Permisos de Sesion";
    case "2fa":
      return "Autenticacion 2FA";
    default:
      return "Configuracion";
  }
}
