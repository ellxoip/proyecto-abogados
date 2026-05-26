import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Shield, AlertTriangle } from 'lucide-react';
import { getApiBaseUrl } from '../../lib/env';
import {
  saveClientToken,
  saveClientSession,
  type SisContableDebtResponse,
} from '../../lib/clientPortal';

type AutoLoginResponse = {
  ok: boolean;
  token?: string;
  cliente?: { id: string; rut: string; nombre: string; email: string };
  debts?: SisContableDebtResponse;
  mustChangePassword?: boolean;
  message?: string;
  code?: string;
};

export default function AutoLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const token = searchParams.get('token') || '';
    if (!token) {
      setStatus('error');
      setErrorMessage('El enlace no contiene un token válido.');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(
          `${getApiBaseUrl()}/api/auto-login?token=${encodeURIComponent(token)}`,
          { headers: { Accept: 'application/json' } },
        );
        const data = (await response.json().catch(() => ({}))) as AutoLoginResponse;
        if (cancelled) return;

        if (!response.ok || !data.ok || !data.token || !data.debts) {
          setStatus('error');
          setErrorMessage(
            data.message ||
              (response.status === 401
                ? 'Tu enlace expiró o fue revocado. Solicita uno nuevo en la oficina.'
                : 'No fue posible iniciar sesión con este enlace.'),
          );
          return;
        }

        saveClientToken(data.token);
        const selectedContractId = data.debts.contratos[0]?.id;
        saveClientSession({
          identifier: data.cliente?.rut || '',
          debts: data.debts,
          selectedContractId,
          passwordChangeRequired: Boolean(data.mustChangePassword),
          payAfterPasswordChange: false,
        });

        navigate('/client/portal', { replace: true });
      } catch (err: any) {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(err?.message || 'Error de red al contactar pagaCuotas.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background-main px-4">
      <div className="bg-primary-container p-3 rounded-xl mb-6">
        <Shield className="w-7 h-7 text-white" />
      </div>

      {status === 'loading' && (
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <h1 className="font-headline-md text-display-md text-primary">Iniciando tu sesión…</h1>
          <p className="text-on-surface-variant mt-2">Estamos cargando tus cuotas desde el sistema contable.</p>
        </div>
      )}

      {status === 'error' && (
        <div className="text-center max-w-md">
          <div className="bg-error-red/10 text-error-red rounded-xl p-4 inline-flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-semibold text-sm">No se pudo abrir tu portal</span>
          </div>
          <p className="text-on-surface-variant mb-6">{errorMessage}</p>
          <p className="text-sm text-on-surface-variant">Solicita un nuevo enlace de pago a tu ejecutivo.</p>
        </div>
      )}
    </div>
  );
}
