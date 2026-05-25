import { Link } from 'react-router-dom';
import { ArrowLeft, Lock, Shield } from 'lucide-react';
import PasswordChangeForm from '../../components/client/PasswordChangeForm';
import { getClientSession } from '../../lib/clientPortal';

export default function Settings() {
  const session = getClientSession();
  if (!session) return null;

  return (
    <main className="flex-grow w-full max-w-md mx-auto px-4 py-8 space-y-6 pb-24">
      <header className="flex items-center gap-3">
        <Link to="/client/portal" className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="font-display-lg text-display-lg font-bold text-primary">Configuración</h1>
      </header>

      <section className="bg-white p-5 rounded-xl border border-border-subtle shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-on-primary-container" />
          <h2 className="font-label-caps text-label-caps font-bold text-on-primary-container">
            CAMBIAR CLAVE
          </h2>
        </div>
        <p className="text-xs text-on-surface-variant">
          Cambia tu clave de acceso cuando lo necesites. Te pedirá la clave actual antes de guardar la nueva.
        </p>
        <PasswordChangeForm forced={false} />
      </section>

      <section className="bg-white p-5 rounded-xl border border-border-subtle shadow-sm space-y-2">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-on-primary-container" />
          <h2 className="font-label-caps text-label-caps font-bold text-on-primary-container">
            CUENTA
          </h2>
        </div>
        <dl className="text-sm space-y-1">
          <div className="flex justify-between">
            <dt className="text-on-surface-variant">RUT</dt>
            <dd className="font-semibold">{session.debts.cliente.rut}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-on-surface-variant">Nombre</dt>
            <dd className="font-semibold">{session.debts.cliente.nombre}</dd>
          </div>
          {session.debts.cliente.email && (
            <div className="flex justify-between">
              <dt className="text-on-surface-variant">Correo</dt>
              <dd className="font-semibold">{session.debts.cliente.email}</dd>
            </div>
          )}
        </dl>
      </section>
    </main>
  );
}
