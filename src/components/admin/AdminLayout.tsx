import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Puzzle,
  Search,
  Settings,
  UserCircle,
  Users,
  XCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { applyAdminPreferences } from '../../lib/adminPreferences';
import { adminRequest, clearAdminToken } from '../../lib/adminApi';

type NotificationItem = {
  id: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  created_at: string;
  href: string;
};

type NotificationsResponse = {
  ok: true;
  unread_count: number;
  notifications: NotificationItem[];
};

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationError, setNotificationError] = useState('');

  useEffect(() => {
    applyAdminPreferences();
  }, []);

  const loadNotifications = async () => {
    setNotificationError('');
    try {
      const response = await adminRequest<NotificationsResponse>('/api/admin/notifications');
      setNotifications(response.notifications);
    } catch (error: any) {
      setNotificationError(error.message || 'No fue posible cargar notificaciones.');
    }
  };

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const adminEmail = useMemo(() => window.sessionStorage.getItem('pagacuotas.adminEmail') || 'Admin User', []);

  const handleLogout = () => {
    clearAdminToken();
    navigate('/admin/login');
  };

  const navItems = [
    { name: 'Panel Principal', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Clientes', path: '/admin/clients', icon: Users },
    { name: 'Integraciones', path: '/admin/integrations', icon: Puzzle },
    { name: 'Configuracion', path: '/admin/settings', icon: Settings },
  ];

  const notificationIcon = (item: NotificationItem) => {
    if (item.type === 'support_ticket') return <LifeBuoy className="h-4 w-4 text-indigo-600" />;
    if (item.severity === 'high') return <XCircle className="h-4 w-4 text-red-500" />;
    return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  };

  return (
    <div className="bg-background-main font-body-base text-text-charcoal flex min-h-screen">
      <aside className="hidden lg:flex flex-col h-full sticky top-0 bg-slate-50 border-r border-slate-200 w-64 z-30">
        <div className="px-6 py-8">
          <h1 className="text-xl font-black text-indigo-950 font-display-lg">PagaCuotas</h1>
          <p className="font-manrope text-sm font-medium text-indigo-900 mt-1 opacity-60">Portal Administrativo</p>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 font-manrope text-sm font-medium transition-colors duration-200 ease-in-out rounded-lg group',
                  isActive
                    ? 'text-indigo-700 font-bold border-r-4 border-indigo-700 bg-indigo-50/50 rounded-r-none'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-indigo-900'
                )}
              >
                <Icon className={cn('w-5 h-5', isActive ? 'text-indigo-700' : 'text-slate-500')} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-1">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-4 py-2 text-slate-600 hover:bg-slate-100 hover:text-indigo-900 transition-colors duration-200 ease-in-out font-manrope text-sm font-medium rounded-lg"
          >
            <LogOut className="w-5 h-5 text-slate-500" />
            <span>Cerrar Sesion</span>
          </button>

          <Link to="/admin/profile" className="mt-4 flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">
            <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center">
              <UserCircle className="w-6 h-6 text-primary" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-primary truncate">{adminEmail}</span>
              <span className="text-[10px] text-slate-500">Super Admin</span>
            </div>
          </Link>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="relative flex justify-between items-center w-full px-6 py-3 sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 font-manrope text-base">
          <div className="flex items-center gap-4">
            <span className="text-lg font-bold text-indigo-950 font-display-lg">Admin PagaCuotas</span>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="pl-10 pr-4 py-1.5 bg-slate-100 border-none rounded-full text-sm focus:ring-2 focus:ring-secondary w-64 transition-all"
                placeholder="Buscar clientes o transacciones..."
                type="text"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setNotificationsOpen((current) => !current);
                  if (!notificationsOpen) loadNotifications();
                }}
                className="relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors text-slate-500 cursor-pointer active:opacity-70"
                aria-label="Ver notificaciones administrativas"
              >
                <Bell className="w-5 h-5" />
                {notifications.length > 0 && (
                  <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
                    {notifications.length > 9 ? '9+' : notifications.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => navigate('/admin/profile')}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors text-slate-500 cursor-pointer active:opacity-70"
                aria-label="Abrir perfil administrativo"
              >
                <UserCircle className="w-6 h-6" />
              </button>
            </div>
          </div>

          {notificationsOpen && (
            <div className="absolute right-6 top-14 z-50 w-[360px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-black text-indigo-950">Notificaciones</p>
                  <p className="text-xs text-slate-500">Pagos, integraciones y soporte</p>
                </div>
                <button onClick={loadNotifications} className="rounded-md px-2 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-50">
                  Actualizar
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {notificationError && (
                  <div className="m-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-600">
                    {notificationError}
                  </div>
                )}
                {!notificationError && notifications.length === 0 && (
                  <div className="p-6 text-center text-sm text-slate-500">Sin alertas pendientes.</div>
                )}
                {notifications.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setNotificationsOpen(false);
                      navigate(item.href);
                    }}
                    className="flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="mt-1">{notificationIcon(item)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-800">{item.title}</span>
                      <span className="block text-xs text-slate-500">{item.message}</span>
                      <span className="mt-1 block text-[10px] font-semibold text-slate-400">
                        {new Date(item.created_at).toLocaleString('es-CL')}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </header>

        <main className="flex-1 flex overflow-hidden">
          <Outlet />
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center bg-white border-t border-slate-200 px-4 pb-6 pt-3 lg:hidden shadow-[0_-4px_12px_rgba(26,43,76,0.05)] rounded-t-xl font-manrope text-[10px] font-semibold">
        <Link to="/admin/dashboard" className={cn('flex flex-col items-center justify-center rounded-xl px-4 py-1 transition-all scale-95 duration-100', location.pathname.startsWith('/admin/dashboard') ? 'bg-indigo-50 text-indigo-800' : 'text-slate-400 active:bg-slate-50')}>
          <LayoutDashboard className="w-6 h-6" />
          <span>Inicio</span>
        </Link>
        <Link to="/admin/clients" className={cn('flex flex-col items-center justify-center rounded-xl px-4 py-1 transition-all scale-95 duration-100', location.pathname.startsWith('/admin/clients') ? 'bg-indigo-50 text-indigo-800' : 'text-slate-400 active:bg-slate-50')}>
          <Users className="w-6 h-6" />
          <span>Clientes</span>
        </Link>
        <Link to="/admin/integrations" className={cn('flex flex-col items-center justify-center rounded-xl px-4 py-1 transition-all scale-95 duration-100', location.pathname.startsWith('/admin/integrations') ? 'bg-indigo-50 text-indigo-800' : 'text-slate-400 active:bg-slate-50')}>
          <Puzzle className="w-6 h-6" />
          <span>Ajustes</span>
        </Link>
      </nav>
    </div>
  );
}
