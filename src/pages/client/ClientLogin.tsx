import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Fingerprint, HelpCircle, Loader2, Lock, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { clientLogin, saveClientSession } from '../../lib/clientPortal';

const DEMO_CLIENT = {
  identifier: '16.798.821-0',
  password: 'DEMO26',
};

const SHOW_DEMO = import.meta.env.VITE_HIDE_DEMO_CREDS !== 'true';
const CLIENT_PASSWORD_PATTERN = /^[A-Z0-9]{6}$/;
const RUT_PATTERN = /^\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]$/;

function validateClientCredentials(identifier: string, password: string) {
  const cleanIdentifier = identifier.trim();
  const cleanPassword = password.trim().toUpperCase();

  if (!cleanIdentifier) return 'Ingresa tu RUT para acceder al portal.';
  if (!RUT_PATTERN.test(cleanIdentifier)) return 'Ingresa un RUT valido, por ejemplo 12.345.678-9.';
  if (!cleanPassword) return 'Ingresa la clave que recibiste.';
  if (!CLIENT_PASSWORD_PATTERN.test(cleanPassword)) return 'La clave debe tener 6 caracteres alfanumericos.';
  return '';
}

export default function ClientLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [identifier, setIdentifier] = useState(() => searchParams.get('identifier')?.trim() || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const performLogin = async (idToUse: string, pwToUse: string) => {
    const cleanIdentifier = idToUse.trim();
    const cleanPassword = pwToUse.trim().toUpperCase();
    const validationError = validateClientCredentials(cleanIdentifier, cleanPassword);

    if (validationError) {
      setErrorMessage(validationError);
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

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    await performLogin(identifier, password);
  };

  const useDemo = async () => {
    setIdentifier(DEMO_CLIENT.identifier);
    setPassword(DEMO_CLIENT.password);
    await performLogin(DEMO_CLIENT.identifier, DEMO_CLIENT.password);
  };

  return (
    <div className="bg-background-main min-h-screen flex flex-col">
      <main className="flex-grow flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-10 h-10 bg-primary-container rounded-lg flex items-center justify-center">
                <Wallet className="w-6 h-6 text-white" />
              </div>
              <span className="text-display-lg font-extrabold tracking-tight text-primary">PagaCuotas</span>
            </div>
            <div className="text-center">
              <h1 className="text-headline-md font-bold text-text-charcoal mb-2">Acceso a tu Portal</h1>
              <p className="text-body-sm text-on-surface-variant">Gestiona tus pagos con seguridad y rapidez</p>
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-border-subtle rounded-lg shadow-sm p-8">
            <form onSubmit={handleLogin} className="space-y-6">
              <label className="block">
                <span className="block text-label-caps uppercase text-on-surface-variant mb-2">Identificacion del cliente</span>
                <div className="relative">
                  <Fingerprint className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-outline-variant" />
                  <input
                    className="w-full pl-10 pr-4 py-3 bg-surface-container-low border border-border-subtle rounded-lg focus:ring-2 focus:ring-secondary focus:border-secondary transition-all text-body-base outline-none"
                    id="identifier"
                    placeholder="Ingresa tu RUT"
                    type="text"
                    value={identifier}
                    onChange={(event) => {
                      setIdentifier(event.target.value);
                      if (errorMessage) setErrorMessage('');
                    }}
                    autoComplete="username"
                    inputMode="text"
                    aria-invalid={Boolean(errorMessage)}
                    disabled={isLoading}
                    required
                  />
                </div>
                <p className="mt-2 text-[11px] text-on-surface-variant">
                  Usa el mismo RUT que recibiste en el mensaje de acceso.
                </p>
              </label>

              <label className="block">
                <span className="block text-label-caps uppercase text-on-surface-variant mb-2">Clave de acceso</span>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-outline-variant" />
                  <input
                    className="w-full pl-10 pr-12 py-3 bg-surface-container-low border border-border-subtle rounded-lg focus:ring-2 focus:ring-secondary focus:border-secondary transition-all text-body-base outline-none"
                    id="password"
                    placeholder="Clave de 6 caracteres"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    maxLength={6}
                    minLength={6}
                    pattern="[A-Za-z0-9]{6}"
                    autoComplete="current-password"
                    aria-invalid={Boolean(errorMessage)}
                    onChange={(event) => {
                      setPassword(event.target.value.toUpperCase());
                      if (errorMessage) setErrorMessage('');
                    }}
                    disabled={isLoading}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Ocultar clave' : 'Mostrar clave'}
                    aria-pressed={showPassword}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-outline-variant transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-on-surface-variant">
                  La clave fue entregada por WhatsApp y puedes cambiarla dentro del portal.
                </p>
              </label>

              {errorMessage && (
                <div className="rounded-lg border border-error-red/30 bg-error-red/10 px-4 py-3 text-sm font-semibold text-error-red">
                  {errorMessage}
                </div>
              )}

              <button
                className="w-full py-4 bg-primary text-white font-manrope font-bold text-body-base rounded-lg shadow-md hover:bg-primary-container active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
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
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            {SHOW_DEMO && (
              <div className="mt-6 rounded-lg border border-dashed border-secondary/40 bg-secondary/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-secondary" />
                  <span className="text-xs font-bold uppercase tracking-wide text-secondary">Demo cliente</span>
                </div>
                <div className="text-xs text-on-surface-variant mb-3 space-y-0.5">
                  <p>RUT: <span className="font-mono">{DEMO_CLIENT.identifier}</span></p>
                  <p>Clave: <span className="font-mono">{DEMO_CLIENT.password}</span></p>
                </div>
                <button
                  type="button"
                  onClick={useDemo}
                  disabled={isLoading}
                  className="w-full py-2 bg-secondary/10 hover:bg-secondary/20 text-secondary border border-secondary/30 rounded-md text-xs font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Entrando...' : 'Usar credenciales demo'}
                </button>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-border-subtle flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-high rounded-full">
                <ShieldCheck className="w-4 h-4 text-success-green" />
                <span className="text-label-caps text-on-surface-variant">Acceso seguro</span>
              </div>
              <Link
                className="inline-flex items-center gap-2 text-body-sm font-semibold text-secondary hover:underline"
                to="/client/support"
              >
                <HelpCircle className="w-4 h-4" />
                Contactar soporte
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
