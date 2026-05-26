import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, LogIn, Lock, Mail, ShieldCheck, Wallet } from 'lucide-react';
import { adminLogin } from '../../lib/adminApi';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    const form = new FormData(event.currentTarget);
    try {
      await adminLogin(String(form.get('email') || ''), String(form.get('password') || ''));
      navigate('/admin/dashboard');
    } catch (error: any) {
      setErrorMessage(error.message || 'No fue posible iniciar sesion.');
    } finally {
      setIsLoading(false);
    }
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
              <h1 className="text-headline-md font-bold text-text-charcoal mb-2">Acceso Administrativo</h1>
              <p className="text-body-sm text-on-surface-variant">Ingresa tus credenciales para gestionar el portal</p>
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-border-subtle rounded-lg shadow-sm p-8">
            <form onSubmit={handleLogin} className="space-y-6">
              <label className="block">
                <span className="block text-label-caps uppercase text-on-surface-variant mb-2">Correo electronico</span>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-outline-variant" />
                  <input className="w-full pl-10 pr-4 py-3 bg-surface-container-low border border-border-subtle rounded-lg focus:ring-2 focus:ring-secondary focus:border-secondary transition-all text-body-base outline-none" name="email" placeholder="admin@pagacuotas.local" required type="email" />
                </div>
              </label>

              <label className="block">
                <span className="block text-label-caps uppercase text-on-surface-variant mb-2">Contrasena</span>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-outline-variant" />
                  <input className="w-full pl-10 pr-12 py-3 bg-surface-container-low border border-border-subtle rounded-lg focus:ring-2 focus:ring-secondary focus:border-secondary transition-all text-body-base outline-none" name="password" required type="password" />
                  <Eye className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-outline-variant" />
                </div>
              </label>

              {errorMessage && (
                <div className="rounded-lg border border-error-red/30 bg-error-red/10 px-4 py-3 text-sm font-semibold text-error-red">
                  {errorMessage}
                </div>
              )}

              <button disabled={isLoading} className="w-full py-4 bg-primary text-white font-manrope font-bold text-body-base rounded-lg shadow-md hover:bg-primary-container active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70" type="submit">
                <span>{isLoading ? 'Validando...' : 'Iniciar Sesion'}</span>
                <LogIn className="w-5 h-5" />
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-border-subtle flex flex-col items-center">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-high rounded-full">
                <ShieldCheck className="w-4 h-4 text-success-green" />
                <span className="text-label-caps text-on-surface-variant">Token firmado y acceso protegido</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
