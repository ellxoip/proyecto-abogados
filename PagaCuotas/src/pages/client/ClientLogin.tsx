import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Shield, Fingerprint, ArrowRight, Verified, Lock, HelpCircle, Loader2, KeyRound, Sparkles } from 'lucide-react';
import { clientLogin, saveClientSession } from '../../lib/clientPortal';

const DEMO_CLIENT = {
  identifier: '16.798.821-0',
  password: 'DEMO26',
};

const SHOW_DEMO = import.meta.env.VITE_HIDE_DEMO_CREDS !== 'true';

export default function ClientLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [identifier, setIdentifier] = useState(() => searchParams.get('identifier')?.trim() || '');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const performLogin = async (idToUse: string, pwToUse: string) => {
    const cleanIdentifier = idToUse.trim();
    const cleanPassword = pwToUse.trim();

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

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    await performLogin(identifier, password);
  };

  const useDemo = async () => {
    setIdentifier(DEMO_CLIENT.identifier);
    setPassword(DEMO_CLIENT.password);
    await performLogin(DEMO_CLIENT.identifier, DEMO_CLIENT.password);
  };

  // Paleta clavada al fondo: negro carbón #0B0C10, oro #E0B84A / #C9A84C,
  // ámbar profundo #9C7E2C, crema #F5E7B8.
  return (
    <div
      className="relative min-h-screen w-full flex flex-col items-center justify-between text-white overflow-hidden"
      style={{
        backgroundColor: '#0B0C10',
        backgroundImage: "url('/brand/login-bg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Overlay oscuro con vignette — atenúa el fondo en bordes, deja la
          zona central (donde está el hexágono y el logo del fondo) más
          visible para que el logo del header NO compita y el card central
          quede legible. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(110% 80% at 50% 45%, rgba(11,12,16,0.20) 0%, rgba(11,12,16,0.68) 60%, rgba(11,12,16,0.92) 100%)',
        }}
      />

      {/* Header — logo del producto en pill semitransparente para que el
          fondo se vea sin tapar la marca. */}
      <header className="relative z-10 w-full h-20 flex items-center justify-center px-6 pt-6">
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md"
          style={{
            background: 'rgba(11,12,16,0.45)',
            border: '1px solid rgba(224,184,74,0.45)',
            boxShadow: '0 4px 18px rgba(0,0,0,0.45), 0 0 24px rgba(224,184,74,0.18)',
          }}
        >
          <div
            className="p-2 rounded-lg"
            style={{ background: 'linear-gradient(180deg, #E0B84A 0%, #9C7E2C 100%)' }}
          >
            <Shield className="w-5 h-5" style={{ color: '#0B0C10', fill: '#0B0C10' }} />
          </div>
          <span
            className="font-headline-md text-display-lg tracking-tight"
            style={{ color: '#F5E7B8' }}
          >
            PagaCuotas
          </span>
        </div>
      </header>

      <main className="relative z-10 w-full max-w-[420px] flex-grow flex flex-col justify-center px-4 pb-12">
        <div className="mb-8 text-center">
          <h1
            className="font-headline-md text-display-lg mb-2"
            style={{ color: '#F5E7B8' }}
          >
            Acceso a tu Portal
          </h1>
          <p
            className="font-body-base"
            style={{ color: 'rgba(245,231,184,0.7)' }}
          >
            Gestiona tus pagos con seguridad y rapidez.
          </p>
        </div>

        <div
          className="rounded-2xl p-8 backdrop-blur-xl"
          style={{
            background:
              'linear-gradient(180deg, rgba(20,22,30,0.78) 0%, rgba(13,14,20,0.85) 100%)',
            border: '1px solid rgba(224,184,74,0.35)',
            boxShadow:
              '0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 60px rgba(224,184,74,0.10)',
          }}
        >
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label
                className="font-label-caps text-label-caps flex items-center gap-2"
                htmlFor="identifier"
                style={{ color: '#E0B84A' }}
              >
                IDENTIFICACION DEL CLIENTE
              </label>
              <div className="relative">
                <input
                  className="w-full px-4 py-4 rounded-lg outline-none transition-all font-body-base text-white placeholder:text-white/40 focus:ring-2"
                  style={{
                    background: 'rgba(11,12,16,0.6)',
                    border: '1px solid rgba(224,184,74,0.30)',
                  }}
                  id="identifier"
                  placeholder="Ingresa tu RUT"
                  type="text"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  disabled={isLoading}
                  required
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Fingerprint className="w-6 h-6" style={{ color: 'rgba(224,184,74,0.6)' }} />
                </div>
              </div>
              <p className="text-[11px] font-body-sm px-1" style={{ color: 'rgba(245,231,184,0.55)' }}>
                Usa el mismo RUT que recibiste en el mensaje de acceso.
              </p>
            </div>

            <div className="space-y-2">
              <label
                className="font-label-caps text-label-caps flex items-center gap-2"
                htmlFor="password"
                style={{ color: '#E0B84A' }}
              >
                CLAVE DE ACCESO
              </label>
              <div className="relative">
                <input
                  className="w-full px-4 py-4 rounded-lg outline-none transition-all font-body-base text-white placeholder:text-white/40 focus:ring-2"
                  style={{
                    background: 'rgba(11,12,16,0.6)',
                    border: '1px solid rgba(224,184,74,0.30)',
                  }}
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
                  <KeyRound className="w-6 h-6" style={{ color: 'rgba(224,184,74,0.6)' }} />
                </div>
              </div>
              <p className="text-[11px] font-body-sm px-1" style={{ color: 'rgba(245,231,184,0.55)' }}>
                La clave fue entregada por WhatsApp y puedes cambiarla dentro del portal.
              </p>
            </div>

            {errorMessage && (
              <div
                className="rounded-lg px-4 py-3 text-sm font-semibold"
                style={{
                  background: 'rgba(180,40,40,0.18)',
                  border: '1px solid rgba(180,40,40,0.45)',
                  color: '#FFB4B4',
                }}
              >
                {errorMessage}
              </div>
            )}

            <button
              className="w-full h-[56px] font-headline-md text-body-base rounded-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 group disabled:cursor-not-allowed disabled:opacity-70 uppercase tracking-[0.14em]"
              type="submit"
              disabled={isLoading}
              style={{
                background:
                  'linear-gradient(180deg, #E0B84A 0%, #C9A84C 50%, #9C7E2C 100%)',
                color: '#0B0C10',
                boxShadow:
                  '0 8px 24px rgba(201,168,76,0.35), 0 0 0 1px rgba(255,225,140,0.4) inset',
              }}
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

          {SHOW_DEMO && (
            <div
              className="mt-6 rounded-lg p-4"
              style={{
                background: 'rgba(224,184,74,0.06)',
                border: '1px dashed rgba(224,184,74,0.5)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4" style={{ color: '#E0B84A' }} />
                <span
                  className="text-xs font-bold uppercase tracking-wide"
                  style={{ color: '#E0B84A' }}
                >
                  Demo cliente
                </span>
              </div>
              <div className="text-xs mb-3 space-y-0.5" style={{ color: 'rgba(245,231,184,0.75)' }}>
                <p>RUT: <span className="font-mono">{DEMO_CLIENT.identifier}</span></p>
                <p>Clave: <span className="font-mono">{DEMO_CLIENT.password}</span></p>
                <p className="text-[10px] mt-1" style={{ color: 'rgba(245,231,184,0.45)' }}>
                  Requiere SIS_CONTABLE_LOCAL_FIXTURES=true
                </p>
              </div>
              <button
                type="button"
                onClick={useDemo}
                disabled={isLoading}
                className="w-full py-2 rounded-md text-xs font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: 'rgba(224,184,74,0.12)',
                  border: '1px solid rgba(224,184,74,0.45)',
                  color: '#E0B84A',
                }}
              >
                {isLoading ? 'Entrando…' : 'Usar credenciales demo'}
              </button>
            </div>
          )}

          <div
            className="mt-8 pt-6 flex items-center justify-center gap-4"
            style={{ borderTop: '1px solid rgba(224,184,74,0.18)' }}
          >
            <div className="flex items-center gap-1.5" style={{ color: 'rgba(245,231,184,0.55)' }}>
              <Verified className="w-4 h-4" />
              <span className="text-[10px] font-semibold tracking-wide uppercase">Encriptacion SSL</span>
            </div>
            <div
              className="w-1 h-1 rounded-full"
              style={{ background: 'rgba(224,184,74,0.45)' }}
            />
            <div className="flex items-center gap-1.5" style={{ color: 'rgba(245,231,184,0.55)' }}>
              <Lock className="w-4 h-4" />
              <span className="text-[10px] font-semibold tracking-wide uppercase">Acceso Seguro</span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4 z-10">
          <a
            className="font-body-sm font-semibold flex items-center gap-1.5 hover:underline decoration-2 underline-offset-4"
            href="#"
            style={{ color: '#E0B84A' }}
          >
            Problemas para ingresar?
          </a>
          <Link
            to="/client/support"
            className="px-6 py-3 rounded-full font-body-sm font-medium flex items-center gap-2 transition-colors backdrop-blur-md"
            style={{
              background: 'rgba(11,12,16,0.55)',
              border: '1px solid rgba(224,184,74,0.40)',
              color: '#F5E7B8',
            }}
          >
            <HelpCircle className="w-5 h-5" style={{ color: '#E0B84A' }} />
            Contactar soporte
          </Link>
        </div>
      </main>

      <footer className="relative z-10 w-full pb-10 flex flex-col items-center">
        <div className="flex gap-4 mb-4">
          {['CL', 'PE', 'CO'].map((c) => (
            <div
              key={c}
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs backdrop-blur-md"
              style={{
                background: 'rgba(11,12,16,0.55)',
                border: '1px solid rgba(224,184,74,0.4)',
                color: '#F5E7B8',
              }}
            >
              {c}
            </div>
          ))}
        </div>
        <p className="text-[12px] font-body-sm" style={{ color: 'rgba(245,231,184,0.5)' }}>
          © 2026 PagaCuotas Financial Services
        </p>
      </footer>
    </div>
  );
}
