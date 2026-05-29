import { useState, type FormEvent } from 'react';
import { CheckCircle2, HelpCircle, Loader2, Send } from 'lucide-react';
import { createSupportTicket, getClientSession } from '../../lib/clientPortal';

const categories = [
  ['payment', 'Problema con pago'],
  ['access', 'Acceso al portal'],
  ['debt', 'Consulta de deuda'],
  ['technical', 'Error tecnico'],
  ['other', 'Otro'],
];

function cleanOptional(value: FormDataEntryValue | null, fallback?: string) {
  const text = (fallback || String(value || '')).trim();
  return text || undefined;
}

export default function Support() {
  const session = getClientSession();
  const cliente = session?.debts.cliente;
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('sending');
    setMessage('');
    const form = new FormData(event.currentTarget);

    try {
      const response = await createSupportTicket({
        requester_identifier: (session?.identifier || String(form.get('identifier') || '')).trim(),
        requester_name: cleanOptional(form.get('name'), cliente?.nombre),
        requester_email: cleanOptional(form.get('email'), cliente?.email),
        requester_phone: cleanOptional(form.get('phone'), cliente?.telefono),
        subject: String(form.get('subject') || '').trim(),
        category: String(form.get('category') || 'other'),
        priority: String(form.get('priority') || 'normal'),
        message: String(form.get('message') || '').trim(),
        source: 'client_portal',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        const validationDetail = Array.isArray(data.errors)
          ? data.errors.map((item: any) => item.message).join(' ')
          : '';
        throw new Error(validationDetail || data.message || 'No fue posible enviar tu solicitud.');
      }
      setTicketNumber(data.ticket?.ticket_number || '');
      setStatus('sent');
      event.currentTarget.reset();
    } catch (error: any) {
      setStatus('error');
      setMessage(error.message || 'No fue posible enviar tu solicitud.');
    }
  };

  return (
    <main className="flex-grow w-full max-w-2xl mx-auto px-4 py-8 pb-28">
      <section className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-white">
            <HelpCircle className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-headline-md text-display-lg text-primary">Soporte PagaCuotas</h1>
            <p className="text-sm text-on-surface-variant">Deja tu solicitud y el equipo administrativo la revisara desde su panel.</p>
          </div>
        </div>
      </section>

      {status === 'sent' && (
        <div className="mb-6 rounded-xl border border-success-green/30 bg-success-green/10 p-5 text-success-green">
          <div className="flex gap-3">
            <CheckCircle2 className="h-6 w-6 shrink-0" />
            <div>
              <p className="font-bold">Solicitud enviada correctamente.</p>
              <p className="text-sm">Numero de ticket: {ticketNumber}. El admin de PagaCuotas ya puede verla en su bandeja.</p>
            </div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="mb-6 rounded-xl border border-error-red/30 bg-error-red/10 p-4 text-sm font-semibold text-error-red">
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-xl border border-border-subtle bg-white p-6 shadow-sm space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-[11px] font-bold uppercase text-on-surface-variant">Identificador</span>
            <input name="identifier" defaultValue={session?.identifier || ''} disabled={Boolean(session?.identifier)} required className="h-12 w-full rounded-lg border border-border-subtle bg-slate-50 px-3 text-sm outline-none focus:border-secondary disabled:text-slate-500" />
          </label>
          <label className="block">
            <span className="mb-2 block text-[11px] font-bold uppercase text-on-surface-variant">Nombre</span>
            <input name="name" defaultValue={cliente?.nombre || ''} className="h-12 w-full rounded-lg border border-border-subtle px-3 text-sm outline-none focus:border-secondary" />
          </label>
          <label className="block">
            <span className="mb-2 block text-[11px] font-bold uppercase text-on-surface-variant">Correo</span>
            <input name="email" defaultValue={cliente?.email || ''} type="email" className="h-12 w-full rounded-lg border border-border-subtle px-3 text-sm outline-none focus:border-secondary" />
          </label>
          <label className="block">
            <span className="mb-2 block text-[11px] font-bold uppercase text-on-surface-variant">Telefono</span>
            <input name="phone" defaultValue={cliente?.telefono || ''} className="h-12 w-full rounded-lg border border-border-subtle px-3 text-sm outline-none focus:border-secondary" />
          </label>
        </div>

        <label className="block">
          <span className="mb-2 block text-[11px] font-bold uppercase text-on-surface-variant">Asunto</span>
          <input name="subject" required minLength={5} maxLength={120} placeholder="Ej: No puedo pagar mi cuota" className="h-12 w-full rounded-lg border border-border-subtle px-3 text-sm outline-none focus:border-secondary" />
        </label>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-[11px] font-bold uppercase text-on-surface-variant">Categoria</span>
            <select name="category" className="h-12 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm outline-none focus:border-secondary">
              {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-[11px] font-bold uppercase text-on-surface-variant">Prioridad</span>
            <select name="priority" className="h-12 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm outline-none focus:border-secondary">
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
              <option value="low">Baja</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-2 block text-[11px] font-bold uppercase text-on-surface-variant">Mensaje</span>
          <textarea name="message" required minLength={10} rows={6} placeholder="Describe lo que necesitas resolver..." className="w-full rounded-lg border border-border-subtle px-3 py-3 text-sm outline-none focus:border-secondary" />
        </label>

        <button disabled={status === 'sending'} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-4 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-70">
          {status === 'sending' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          Enviar solicitud
        </button>
      </form>
    </main>
  );
}
