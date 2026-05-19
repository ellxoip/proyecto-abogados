import { useEffect, useState } from 'react';
import { LifeBuoy, RefreshCw } from 'lucide-react';
import { adminRequest } from '../../lib/adminApi';

type Ticket = {
  id: string;
  ticket_number: string;
  requester_identifier: string;
  requester_name: string | null;
  requester_email: string | null;
  subject: string;
  category: string;
  priority: string;
  status: string;
  notification_status: string;
  created_at: string;
};

type TicketsResponse = {
  ok: true;
  tickets: Ticket[];
  stats: Record<string, number>;
};

export default function SupportInbox() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadTickets = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const response = await adminRequest<TicketsResponse>('/api/admin/support/tickets?limit=50');
      setTickets(response.tickets);
    } catch (error: any) {
      setErrorMessage(error.message || 'No fue posible cargar solicitudes de soporte.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  return (
    <div className="p-6 md:p-10 w-full h-full overflow-y-auto bg-background-main">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-headline-md text-display-lg text-primary">Solicitudes de clientes</h1>
            <p className="font-body-base text-on-surface-variant">Bandeja real de tickets enviados desde el portal cliente.</p>
          </div>
          <button onClick={loadTickets} disabled={isLoading} className="inline-flex items-center gap-2 rounded-lg bg-secondary px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </header>

        {errorMessage && (
          <div className="rounded-xl border border-error-red/30 bg-error-red/10 p-4 text-sm font-semibold text-error-red">
            {errorMessage}
          </div>
        )}

        <section className="overflow-hidden rounded-xl border border-border-subtle bg-white shadow-sm">
          <div className="border-b border-border-subtle p-5">
            <div className="flex items-center gap-2 text-primary">
              <LifeBuoy className="h-5 w-5 text-secondary" />
              <h2 className="font-headline-md text-lg">Tickets recibidos</h2>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-[10px] font-black uppercase text-slate-500">Ticket</th>
                  <th className="px-5 py-3 text-[10px] font-black uppercase text-slate-500">Cliente</th>
                  <th className="px-5 py-3 text-[10px] font-black uppercase text-slate-500">Asunto</th>
                  <th className="px-5 py-3 text-[10px] font-black uppercase text-slate-500">Estado</th>
                  <th className="px-5 py-3 text-[10px] font-black uppercase text-slate-500">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td className="px-5 py-4 text-sm font-black text-primary">{ticket.ticket_number}</td>
                    <td className="px-5 py-4 text-sm text-slate-700">{ticket.requester_name || ticket.requester_identifier}</td>
                    <td className="px-5 py-4 text-sm text-slate-700">{ticket.subject}</td>
                    <td className="px-5 py-4 text-xs font-bold uppercase text-slate-500">{ticket.status}</td>
                    <td className="px-5 py-4 text-xs text-slate-500">{new Date(ticket.created_at).toLocaleString('es-CL')}</td>
                  </tr>
                ))}
                {!isLoading && tickets.length === 0 && (
                  <tr>
                    <td className="px-5 py-8 text-center text-sm text-slate-500" colSpan={5}>No hay solicitudes pendientes.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
