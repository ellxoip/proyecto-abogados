import { Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import { Shield, Bell, Home, CreditCard, Lock, ArrowLeft, HelpCircle, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function ClientLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const isPaymentPage = location.pathname.includes('/payment');

  return (
    <div className="bg-background-main font-body-base text-text-charcoal min-h-screen flex flex-col">
      {/* Top Navigation Header */}
      {isPaymentPage ? (
        <header className="flex justify-between items-center px-6 h-16 w-full sticky top-0 z-40 bg-white border-b border-slate-200">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)}
              className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-slate-900" />
            </button>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight font-display-lg">PagaCuotas</h1>
          </div>
          <div className="flex items-center gap-4">
            <Lock className="w-5 h-5 text-slate-900" />
          </div>
        </header>
      ) : (
        <nav className="flex justify-between items-center w-full px-6 py-3 sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="bg-primary-container p-1 rounded-lg">
              <Shield className="w-4 h-4 text-white fill-white" />
            </div>
            <span className="text-lg font-bold text-indigo-950 font-headline-md">PagaCuotas</span>
          </div>
          <div className="flex items-center gap-4">
            <Bell className="w-5 h-5 text-slate-500 cursor-pointer" />
            <Link to="/client/settings" aria-label="Configuración">
              <SettingsIcon className={cn('w-5 h-5 cursor-pointer', location.pathname.includes('/settings') ? 'text-indigo-800' : 'text-slate-500')} />
            </Link>
          </div>
        </nav>
      )}

      {/* Main Content Area */}
      <Outlet />

      {/* Bottom Navigation Bar (Mobile Only) - Only show if not on payment execution page */}
      {!isPaymentPage && (
        <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-3 lg:hidden bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(26,43,76,0.05)] rounded-t-xl">
          <Link 
            to="/client/portal" 
            className={cn("flex flex-col items-center justify-center rounded-xl px-4 py-1", location.pathname.includes('/portal') ? "bg-indigo-50 text-indigo-800" : "text-slate-400")}
          >
            <Home className="w-6 h-6" />
            <span className="font-manrope text-[10px] font-semibold mt-1">Inicio</span>
          </Link>
          <Link 
            to="/client/payment" 
            className="flex flex-col items-center justify-center text-slate-400 px-4 py-1"
          >
            <CreditCard className="w-6 h-6" />
            <span className="font-manrope text-[10px] font-semibold mt-1">Pagos</span>
          </Link>
          <Link to="/client/support" className={cn("flex flex-col items-center justify-center rounded-xl px-4 py-1", location.pathname.includes('/support') ? "bg-indigo-50 text-indigo-800" : "text-slate-400")}>
            <HelpCircle className="w-6 h-6" />
            <span className="font-manrope text-[10px] font-semibold mt-1">Soporte</span>
          </Link>
          <Link to="/client/settings" className={cn("flex flex-col items-center justify-center rounded-xl px-4 py-1", location.pathname.includes('/settings') ? "bg-indigo-50 text-indigo-800" : "text-slate-400")}>
            <SettingsIcon className="w-6 h-6" />
            <span className="font-manrope text-[10px] font-semibold mt-1">Ajustes</span>
          </Link>
        </nav>
      )}
    </div>
  );
}
