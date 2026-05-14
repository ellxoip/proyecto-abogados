"use client";

import Link from "next/link";
import { Bell, Search, User, Settings, LogOut, Shield, Clock, Brain, AlertTriangle, MessageSquare, ChevronDown } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { signOut } from "next-auth/react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface DbNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  caseId: string | null;
  read: boolean;
  createdAt: string;
}

interface DbMessageSummary {
  caseId: string;
  caseCode: string;
  clientName: string;
  body: string;
  authorName: string;
  authorId: string;
  type: string;
  createdAt: string;
  isMine: boolean;
}

const NOTIF_ICONS: Record<string, React.ElementType> = {
  SLA_RIESGO: Shield,
  SLA_INCUMPLIDO: AlertTriangle,
  CASO_ESTANCADO: Clock,
  IA_URGENTE: Brain,
  default: Bell,
};

interface ModernHeaderProps {
  userName: string;
  userRole: string;
}

export function ModernHeader({ userName, userRole }: ModernHeaderProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const [messageSummaries, setMessageSummaries] = useState<DbMessageSummary[]>([]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/productividad/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
      }
    } catch {}
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/mensajeria/summary");
      if (res.ok) {
        const data = await res.json();
        setMessageSummaries(data.messages ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifications();
    fetchMessages();
    const interval = setInterval(() => {
      fetchNotifications();
      fetchMessages();
    }, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications, fetchMessages]);

  async function markRead(id?: string) {
    try {
      await fetch("/api/productividad/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { markAllRead: true }),
      });
      if (id) {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      } else {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      }
    } catch {}
  }

  const unreadCount = notifications.filter((n) => !n.read).length;
  const messageUnreadCount = messageSummaries.filter((m) => !m.isMine).length;

  return (
    <header
      className="sticky top-0 z-20 backdrop-blur-sm"
      style={{
        background: "rgba(255, 255, 255, 0.92)",
        borderBottom: "1px solid var(--border-glass)",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 pl-14 lg:pl-6">
        <div className="flex-1 max-w-xl hidden sm:block">
          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 transform -translate-y-1/2"
              size={18}
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              placeholder="Buscar casos, clientes, documentos..."
              className="w-full pl-12 pr-4 py-2.5 rounded-lg text-sm transition-all duration-200 focus:outline-none focus:ring-2"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border-glass)",
                color: "var(--text)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.background = "var(--surface-2)";
                e.currentTarget.style.borderColor = "var(--gold)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(38, 35, 92, 0.14)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.background = "var(--surface)";
                e.currentTarget.style.borderColor = "var(--border-glass)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>
        </div>

        <button
          aria-label="Buscar"
          className="sm:hidden btn-ghost p-2 rounded-lg"
          style={{ color: "#FFFFFF" }}
        >
          <Search size={20} />
        </button>

        <div className="flex items-center gap-2 sm:gap-4 sm:ml-6">
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowMessages(false);
                setShowUserMenu(false);
              }}
              className="relative btn-ghost p-2 rounded-lg"
              style={{ color: "#FFFFFF" }}
              aria-label="Notificaciones"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span
                  className="absolute top-1 right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center"
                  style={{
                    background: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
                    color: "#FFFFFF",
                    border: "2px solid var(--surface)",
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div
                className="absolute right-0 mt-2 w-96 rounded-lg shadow-xl overflow-hidden"
                style={{ background: "var(--surface)", border: "1px solid var(--border-glass)", zIndex: 50 }}
              >
                <div
                  className="px-4 py-3 border-b flex items-center justify-between"
                  style={{ borderColor: "var(--border-glass)", background: "var(--surface-2)" }}
                >
                  <h3 className="font-bold text-sm" style={{ color: "var(--text)" }}>
                    Notificaciones
                  </h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markRead()}
                      className="text-[10px] font-bold uppercase tracking-wide"
                      style={{ color: "#FFFFFF" }}
                    >
                      Marcar todas como leídas
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--border-glass)" }} />
                      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                        Sin notificaciones
                      </p>
                    </div>
                  ) : (
                    notifications.map((notif) => {
                      const Icon = NOTIF_ICONS[notif.type] ?? NOTIF_ICONS.default;
                      return (
                        <div
                          key={notif.id}
                          onClick={() => markRead(notif.id)}
                          className="px-4 py-3 border-b cursor-pointer transition-colors hover:bg-[var(--row-hover)]"
                          style={{
                            borderColor: "var(--border-glass)",
                            background: !notif.read ? "rgba(38, 35, 92, 0.08)" : "transparent",
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className="p-1.5 rounded flex-shrink-0 mt-0.5"
                              style={{ background: !notif.read ? "rgba(38,35,92,0.16)" : "var(--surface)" }}
                            >
                              <Icon size={13} style={{ color: !notif.read ? "var(--gold)" : "var(--text-muted)" }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                                {notif.title}
                              </p>
                              <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-muted)" }}>
                                {notif.body}
                              </p>
                              <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                                {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: es })}
                              </p>
                            </div>
                            {!notif.read && (
                              <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: "var(--gold)" }} />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="px-4 py-3 text-center border-t" style={{ borderColor: "var(--border-glass)" }}>
                  <a href="/admin/productividad" className="text-xs font-semibold" style={{ color: "#FFFFFF" }}>
                    Ver dashboard de productividad →
                  </a>
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setShowMessages(!showMessages);
                setShowNotifications(false);
                setShowUserMenu(false);
              }}
              className="relative btn-ghost p-2 rounded-lg"
              style={{ color: "#FFFFFF" }}
              aria-label="Mensajes"
            >
              <MessageSquare size={20} />
              {messageUnreadCount > 0 && (
                <span
                  className="absolute top-1 right-1 min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                  style={{
                    background: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
                    color: "#FFFFFF",
                    border: "2px solid var(--surface)",
                  }}
                >
                  {messageUnreadCount}
                </span>
              )}
            </button>

            {showMessages && (
              <div
                className="absolute right-0 mt-2 w-[28rem] rounded-lg shadow-xl overflow-hidden"
                style={{ background: "var(--surface)", border: "1px solid var(--border-glass)", zIndex: 50 }}
              >
                <div
                  className="px-4 py-3 border-b flex items-center justify-between"
                  style={{ borderColor: "var(--border-glass)", background: "var(--surface-2)" }}
                >
                  <h3 className="font-bold text-sm" style={{ color: "var(--text)" }}>
                    Mensajes recientes
                  </h3>
                  {messageUnreadCount > 0 && (
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--red)" }}>
                      {messageUnreadCount} nuevos
                    </span>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {messageSummaries.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <MessageSquare className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--border-glass)" }} />
                      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                        Sin mensajes recientes
                      </p>
                    </div>
                  ) : (
                    messageSummaries.map((message) => (
                      <Link
                        key={`${message.caseId}:${message.type}:${message.createdAt}`}
                        href={`/admin/casos/${message.caseId}`}
                        onClick={() => setShowMessages(false)}
                        className="block px-4 py-3 border-b cursor-pointer transition-colors hover:bg-[var(--row-hover)]"
                        style={{ borderColor: "var(--border-glass)" }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)", color: "#FFFFFF" }}>
                            <MessageSquare size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                                {message.caseCode} · {message.clientName}
                              </p>
                              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                                {message.type === "INTERNAL" ? "Equipo" : "Cliente"}
                              </span>
                            </div>
                            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-muted)" }}>
                              {message.body}
                            </p>
                            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                              {message.authorName} ·{" "}
                              {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true, locale: es })}
                            </p>
                          </div>
                          {!message.isMine && (
                            <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: "var(--gold)" }} />
                          )}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
                <div
                  className="px-4 py-3 text-center border-t flex items-center justify-between"
                  style={{ borderColor: "var(--border-glass)" }}
                >
                  <Link href="/admin/mensajeria" className="text-xs font-semibold" style={{ color: "#FFFFFF" }} onClick={() => setShowMessages(false)}>
                    Abrir centro de mensajería
                  </Link>
                  <Link href="/admin/bandeja" className="text-xs font-semibold" style={{ color: "#FFFFFF" }} onClick={() => setShowMessages(false)}>
                    Bandeja
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowUserMenu(!showUserMenu);
                setShowNotifications(false);
                setShowMessages(false);
              }}
              aria-haspopup="menu"
              aria-expanded={showUserMenu}
              aria-label="Abrir menú de usuario"
              title="Menú de usuario"
              className="btn-ghost flex items-center gap-3 px-2 sm:px-3 py-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm"
                style={{
                  background: "linear-gradient(135deg, var(--gold) 0%, var(--gold-deep) 100%)",
                  color: "#FFFFFF",
                }}
              >
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="text-left hidden md:block">
                <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {userName}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {userRole}
                </div>
              </div>
              <ChevronDown
                aria-hidden
                className={`hidden md:block h-4 w-4 transition-transform duration-200 ${showUserMenu ? "rotate-180" : ""}`}
                style={{ color: "var(--text-muted)" }}
              />
              <ChevronDown
                aria-hidden
                className={`md:hidden h-3.5 w-3.5 transition-transform duration-200 ${showUserMenu ? "rotate-180" : ""}`}
                style={{ color: "var(--text-muted)" }}
              />
            </button>

            {showUserMenu && (
              <div
                className="absolute right-0 mt-2 w-56 rounded-lg shadow-xl overflow-hidden"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-glass)",
                }}
              >
                <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border-glass)" }}>
                  <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>
                    {userName}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {userRole}
                  </p>
                </div>
                <div className="py-2">
                  <a href="/admin/perfil" className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-[var(--row-hover)] transition-colors">
                    <User size={16} style={{ color: "var(--text-muted)" }} />
                    <span style={{ color: "var(--text)" }}>Mi Perfil</span>
                  </a>
                  <a href="/admin/configuracion" className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-[var(--row-hover)] transition-colors">
                    <Settings size={16} style={{ color: "var(--text-muted)" }} />
                    <span style={{ color: "var(--text)" }}>Configuración</span>
                  </a>
                </div>
                <div className="border-t py-2" style={{ borderColor: "var(--border-glass)" }}>
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-[var(--red-dim)] transition-colors"
                  >
                    <LogOut size={16} style={{ color: "var(--red)" }} />
                    <span style={{ color: "var(--red)" }}>Cerrar Sesión</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
