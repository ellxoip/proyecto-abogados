"use client";

import { Bell, Search, User, Settings, LogOut, Shield, Clock, Brain, AlertTriangle } from "lucide-react";
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
  const [notifications, setNotifications] = useState<DbNotification[]>([]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/productividad/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  async function markRead(id?: string) {
    try {
      await fetch("/api/productividad/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { markAllRead: true }),
      });
      if (id) {
        setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
      } else {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      }
    } catch {}
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header
      className="sticky top-0 z-20 backdrop-blur-sm"
      style={{
        background: "rgba(255, 255, 255, 0.92)",
        borderBottom: "1px solid var(--border-glass)",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)"
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 pl-14 lg:pl-6">
        {/* Search Bar */}
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
                color: "var(--text)"
              }}
              onFocus={(e) => {
                e.currentTarget.style.background = "var(--surface-2)";
                e.currentTarget.style.borderColor = "var(--gold)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(201, 168, 76, 0.14)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.background = "var(--surface)";
                e.currentTarget.style.borderColor = "var(--border-glass)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>
        </div>

        {/* Search button (mobile only) */}
        <button
          aria-label="Buscar"
          className="sm:hidden p-2 rounded-lg transition-all duration-200 hover:bg-[rgba(255,255,255,0.05)]"
          style={{ color: "var(--text-muted)" }}
        >
          <Search size={20} />
        </button>

        {/* Right Section */}
        <div className="flex items-center gap-2 sm:gap-4 sm:ml-6">
          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowUserMenu(false);
              }}
              className="relative p-2 rounded-lg transition-all duration-200 hover:bg-[rgba(255,255,255,0.05)]"
              style={{ color: "var(--text-muted)" }}
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span
                  className="absolute top-1 right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center"
                  style={{
                    background: "var(--red)",
                    color: "#FFFFFF",
                    border: "2px solid var(--surface)"
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <div
                className="absolute right-0 mt-2 w-96 rounded-lg shadow-xl overflow-hidden"
                style={{ background: "var(--surface)", border: "1px solid var(--border-glass)", zIndex: 50 }}
              >
                <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border-glass)", background: "var(--surface-2)" }}>
                  <h3 className="font-bold text-sm" style={{ color: "var(--text)" }}>Notificaciones</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markRead()}
                      className="text-[10px] font-bold uppercase tracking-wide"
                      style={{ color: "var(--gold)" }}
                    >
                      Marcar todas como leídas
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--border-glass)" }} />
                      <p className="text-sm" style={{ color: "var(--text-muted)" }}>Sin notificaciones</p>
                    </div>
                  ) : (
                    notifications.map((notif) => {
                      const Icon = NOTIF_ICONS[notif.type] ?? NOTIF_ICONS.default;
                      return (
                        <div
                          key={notif.id}
                          onClick={() => markRead(notif.id)}
                          className="px-4 py-3 border-b cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                          style={{
                            borderColor: "var(--border-glass)",
                            background: !notif.read ? "rgba(201, 168, 76, 0.08)" : "transparent",
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-1.5 rounded flex-shrink-0 mt-0.5" style={{ background: !notif.read ? "rgba(201,168,76,0.16)" : "var(--surface)" }}>
                              <Icon size={13} style={{ color: !notif.read ? "var(--gold)" : "var(--text-muted)" }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{notif.title}</p>
                              <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-muted)" }}>{notif.body}</p>
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
                  <a href="/admin/productividad" className="text-xs font-semibold" style={{ color: "var(--gold)" }}>
                    Ver dashboard de productividad →
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => {
                setShowUserMenu(!showUserMenu);
                setShowNotifications(false);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 hover:bg-[rgba(255,255,255,0.05)]"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm"
                style={{
                  background: "linear-gradient(135deg, var(--gold) 0%, var(--lemon-soft) 100%)",
                  color: "#FFFFFF"
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
            </button>

            {/* User Dropdown */}
            {showUserMenu && (
              <div
                className="absolute right-0 mt-2 w-56 rounded-lg shadow-xl overflow-hidden"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-glass)"
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
                  <a 
                    href="/admin/perfil"
                    className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                  >
                    <User size={16} style={{ color: "var(--text-muted)" }} />
                    <span style={{ color: "var(--text)" }}>Mi Perfil</span>
                  </a>
                  <a 
                    href="/admin/configuracion"
                    className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                  >
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
