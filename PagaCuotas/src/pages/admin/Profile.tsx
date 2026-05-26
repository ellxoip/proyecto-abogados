import { useEffect, useState } from 'react';
import { CalendarClock, KeyRound, ShieldCheck, UserCircle } from 'lucide-react';
import { adminRequest } from '../../lib/adminApi';

type ProfileResponse = {
  ok: true;
  profile: {
    email: string;
    role: string;
    permissions: string[];
    session_expires_at: string | null;
    environment: string;
  };
};

export default function Profile() {
  const [profile, setProfile] = useState<ProfileResponse['profile'] | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    adminRequest<ProfileResponse>('/api/admin/profile')
      .then((response) => setProfile(response.profile))
      .catch((error: any) => setErrorMessage(error.message || 'No fue posible cargar el perfil.'));
  }, []);

  return (
    <div className="p-6 md:p-10 w-full h-full overflow-y-auto bg-background-main">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="font-headline-md text-display-lg text-primary">Perfil del administrador</h1>
          <p className="font-body-base text-on-surface-variant">Sesion, permisos y contexto operativo de PagaCuotas.</p>
        </header>

        {errorMessage && (
          <div className="rounded-xl border border-error-red/30 bg-error-red/10 p-4 text-sm font-semibold text-error-red">
            {errorMessage}
          </div>
        )}

        <section className="rounded-xl border border-border-subtle bg-white shadow-sm">
          <div className="flex items-center gap-4 border-b border-border-subtle p-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
              <UserCircle className="h-9 w-9 text-indigo-700" />
            </div>
            <div>
              <h2 className="text-xl font-black text-primary">{profile?.email || 'Administrador'}</h2>
              <p className="text-sm font-semibold text-on-surface-variant">{profile?.role || 'Super Admin'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3">
            <div className="rounded-lg border border-border-subtle p-4">
              <ShieldCheck className="mb-3 h-5 w-5 text-success-green" />
              <p className="text-xs font-bold uppercase text-slate-500">Ambiente de pago</p>
              <p className="mt-1 text-lg font-black text-primary">{profile?.environment || '-'}</p>
            </div>
            <div className="rounded-lg border border-border-subtle p-4">
              <CalendarClock className="mb-3 h-5 w-5 text-secondary" />
              <p className="text-xs font-bold uppercase text-slate-500">Sesion expira</p>
              <p className="mt-1 text-sm font-black text-primary">
                {profile?.session_expires_at ? new Date(profile.session_expires_at).toLocaleString('es-CL') : '-'}
              </p>
            </div>
            <div className="rounded-lg border border-border-subtle p-4">
              <KeyRound className="mb-3 h-5 w-5 text-indigo-600" />
              <p className="text-xs font-bold uppercase text-slate-500">Permisos</p>
              <p className="mt-1 text-lg font-black text-primary">{profile?.permissions.length || 0}</p>
            </div>
          </div>

          <div className="border-t border-border-subtle p-6">
            <p className="mb-3 text-xs font-bold uppercase text-slate-500">Permisos activos</p>
            <div className="flex flex-wrap gap-2">
              {(profile?.permissions || []).map((permission) => (
                <span key={permission} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                  {permission}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
