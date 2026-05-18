import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Fingerprint, ArrowRight, Verified, Lock, HelpCircle, Loader2, KeyRound } from 'lucide-react';
import { clientLogin, saveClientSession } from '../../lib/clientPortal';

export default function ClientLogin() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    const cleanIdentifier = identifier.trim();
    const cleanPassword = password.trim();

    if (!cleanIdentifier || !/^[a-zA-Z0-9]{6}$/.test(cleanPassword)) {
      setErrorMessage('Ingresa tu RUT y la clave alfanumerica de 6 caracteres.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const result = await clientLogin(cleanIdentifier, cleanPassword);
      saveClientSession({
        identifier: cleanIdentifier,
        debts: result.debts,
        selectedContractId: result.debts.contratos[0]?.id,
      });
      navigate('/client/portal');
    } catch (error: any) {
      setErrorMessage(error.message || 'No fue posible validar las credenciales.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="font-body-base text-text-charcoal min-h-screen flex flex-col items-center justify-between bg-background-main relative">
      <header className="w-full h-20 flex items-center justify-center px-6">
        <div className="flex items-center gap-2">
          <div className="bg-primary-container p-2 rounded-lg">
            <Shield className="w-6 h-6 text-white fill-white" />
          </div>
          <span className="font-headline-md text-display-lg tracking-tight text-primary">PagaCuotas</span>
        </div>
      </header>

      <main className="w-full max-w-[400px] flex-grow flex flex-col justify-center px-4 pb-12">
        <div className="mb-10 text-center">
          <h1 className="font-headline-md text-display-lg text-primary mb-2">Acceso a tu Portal</h1>
          <p className="font-body-base text-on-surface-variant">Gestiona tus pagos con seguridad y rapidez.</p>
        </div>

        <div className="bg-surface-container-lowest border border-border-subtle rounded-xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-2" htmlFor="identifier">
                IDENTIFICACION DEL CLIENTE
              </label>
              <div className="relative">
                <input
                  className="w-full px-4 py-4 rounded-lg bg-surface-container-low border border-outline-variant focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition-all outline-none font-body-base placeholder:text-slate-400"
                  id="identifier"
                  placeholder="Ingresa tu RUT"
                  type="text"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  disabled={isLoading}
                  required
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Fingerprint className="w-6 h-6 text-slate-300" />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 font-body-sm px-1">Usa el mismo RUT que recibiste en el mensaje de acceso.</p>
            </div>

            <div className="space-y-2">
              <label className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-2" htmlFor="email">
                CLAVE DE ACCESO
              </label>
              <div className="relative">
                <input
                  className="w-full px-4 py-4 rounded-lg bg-surface-container-low border border-outline-variant focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition-all outline-none font-body-base placeholder:text-slate-400"
                  id="password"
                  placeholder="Clave de 6 caracteres"
                  type="password"
                  value={password}
                  maxLength={6}
                  onChange={(event) => setPassword(event.target.value.toUpperCase())}
                  disabled={isLoading}
                  required
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <KeyRound className="w-6 h-6 text-slate-300" />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 font-body-sm px-1">La clave fue entregada por WhatsApp y puedes cambiarla dentro del portal.</p>
            </div>

            {errorMessage && (
              <div className="rounded-lg border border-error-red/30 bg-error-red/10 px-4 py-3 text-sm font-semibold text-error-red">
                {errorMessage}
              </div>
            )}

            <button
              className="w-full h-[56px] bg-primary-container text-white font-headline-md text-body-base rounded-lg shadow-lg shadow-primary-container/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group disabled:cursor-not-allowed disabled:opacity-70"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Consultando datos
                </>
              ) : (
                <>
                  Ver el estado de mi servicio
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-4 text-slate-400">
            <div className="flex items-center gap-1.5">
              <Verified className="w-4 h-4" />
              <span className="text-[10px] font-semibold tracking-wide uppercase">Encriptacion SSL</span>
            </div>
            <div className="w-1 h-1 bg-slate-200 rounded-full"></div>
            <div className="flex items-center gap-1.5">
              <Lock className="w-4 h-4" />
              <span className="text-[10px] font-semibold tracking-wide uppercase">Acceso Seguro</span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4 z-10">
          <a className="text-secondary font-body-sm font-semibold flex items-center gap-1.5 hover:underline decoration-2 underline-offset-4" href="#">
            Problemas para ingresar?
          </a>
          <Link to="/client/support" className="bg-white border border-border-subtle text-on-surface px-6 py-3 rounded-full font-body-sm font-medium flex items-center gap-2 hover:bg-slate-50 transition-colors shadow-sm">
            <HelpCircle className="w-5 h-5 text-primary" />
            Contactar soporte
          </Link>
        </div>
      </main>

      <footer className="w-full pb-10 flex flex-col items-center z-10">
        <div className="flex gap-4 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-border-subtle shadow-sm font-bold text-xs text-slate-700">CL</div>
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-border-subtle shadow-sm font-bold text-xs text-slate-700">PE</div>
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-border-subtle shadow-sm font-bold text-xs text-slate-700">CO</div>
        </div>
        <p className="text-[12px] text-slate-400 font-body-sm">© 2026 PagaCuotas Financial Services</p>
      </footer>
    </div>
  );
}
