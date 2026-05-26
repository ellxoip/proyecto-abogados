import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, RefreshCw, Search, XCircle } from 'lucide-react';
import { adminRequest } from '../../lib/adminApi';
import { formatCurrency, formatDate } from '../../lib/clientPortal';

type ClientRow = {
  cliente_contable_id: string;
  identifier: string;
  contracts: string[];
  attempts: number;
  confirmed_payments: number;
  total_paid: number;
  last_activity: string;
  sync_errors: number;
  status: 'REQUIERE_REVISION' | 'CON_PAGOS' | 'SIN_PAGOS_CONFIRMADOS';
};

type ClientsResponse = {
  ok: true;
  clients: ClientRow[];
};

const statusStyles = {
  REQUIERE_REVISION: 'bg-red-100 text-red-800',
  CON_PAGOS: 'bg-green-100 text-green-800',
  SIN_PAGOS_CONFIRMADOS: 'bg-slate-100 text-slate-700',
};

export default function Clients() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [query, setQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadClients = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const response = await adminRequest<ClientsResponse>('/api/admin/clients');
      setClients(response.clients);
    } catch (error: any) {
      setErrorMessage(error.message || 'No fue posible cargar clientes.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const filteredClients = clients.filter((client) => {
    const haystack = `${client.identifier} ${client.cliente_contable_id} ${client.contracts.join(' ')}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return (
    <div className="flex-1 flex overflow-hidden w-full relative">
      <section className="flex-1 flex flex-col p-6 min-w-0 overflow-y-auto">
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="font-headline-md text-display-lg text-primary">Clientes con actividad</h1>
            <p className="text-sm text-on-surface-variant">Construido desde intentos y pagos reales registrados en PagaCuotas.</p>
          </div>
          <button onClick={loadClients} disabled={isLoading} className="px-4 py-2 bg-[#e8f0fa] text-[#285a8f] border border-[#9bb7d8] font-label-caps rounded-lg hover:bg-[#dce9f7] transition-colors flex items-center shadow-sm disabled:opacity-70">
            <RefreshCw className={`w-5 h-5 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        <div className="mb-4 flex items-center bg-white border border-border-subtle rounded-lg px-3 max-w-md">
          <Search className="w-4 h-4 text-slate-400 mr-2" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 flex-1 bg-transparent outline-none text-sm" placeholder="Buscar por RUT, cliente o contrato" />
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-error-red/30 bg-error-red/10 p-4 text-error-red font-semibold">
            {errorMessage}
          </div>
        )}

        <div className="bg-white border border-border-subtle rounded-xl overflow-hidden flex-1 flex flex-col shadow-sm mb-6">
          <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 border-b border-border-subtle z-10">
                <tr>
                  <th className="px-6 py-4 font-label-caps text-slate-500 whitespace-nowrap">Cliente</th>
                  <th className="px-6 py-4 font-label-caps text-slate-500 whitespace-nowrap">Contratos</th>
                  <th className="px-6 py-4 font-label-caps text-slate-500 whitespace-nowrap">Intentos</th>
                  <th className="px-6 py-4 font-label-caps text-slate-500 whitespace-nowrap">Pagos confirmados</th>
                  <th className="px-6 py-4 font-label-caps text-slate-500 whitespace-nowrap">Total pagado</th>
                  <th className="px-6 py-4 font-label-caps text-slate-500 whitespace-nowrap">Ultima actividad</th>
                  <th className="px-6 py-4 font-label-caps text-slate-500 whitespace-nowrap">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClients.map((client) => (
                  <tr key={client.cliente_contable_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-headline-md text-sm whitespace-nowrap">{client.identifier}</div>
                      <div className="text-slate-400 text-xs font-body-sm">ID contable: {client.cliente_contable_id}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">{client.contracts.join(', ') || '-'}</td>
                    <td className="px-6 py-4 font-numeric-data text-sm">{client.attempts}</td>
                    <td className="px-6 py-4 font-numeric-data text-sm">{client.confirmed_payments}</td>
                    <td className="px-6 py-4 font-numeric-data text-sm">{formatCurrency(client.total_paid)}</td>
                    <td className="px-6 py-4 text-sm whitespace-nowrap">{formatDate(client.last_activity)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[client.status]}`}>
                        {client.status === 'REQUIERE_REVISION' ? <AlertCircle className="h-3.5 w-3.5" /> : client.status === 'CON_PAGOS' ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {client.status.replaceAll('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
                {!isLoading && filteredClients.length === 0 && (
                  <tr>
                    <td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={7}>No hay clientes registrados desde pagos reales todavia.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
