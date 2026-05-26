import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Verified, Check, Flag, Wallet, CheckCircle2, Clock, Lock, MoreHorizontal, ChevronDown, Loader2, AlertCircle, FileText } from 'lucide-react';
import {
  daysUntil,
  fetchBillingDocuments,
  fetchContractInstallments,
  formatCurrency,
  formatDate,
  getClientSession,
  saveClientSession,
  saveSelectedPayment,
  updateClientPassword,
  type SisContableContrato,
  type SisContableCuota,
  type SisContableInstallmentsResponse,
  type BillingDocumentSummary,
} from '../../lib/clientPortal';
import { cn } from '../../lib/utils';

const payableStatuses = ['PENDIENTE', 'VENCIDA', 'POR_VENCER', 'PAGO_PENDIENTE'];

function getFirstName(fullName?: string) {
  return fullName?.trim().split(/\s+/)[0] || 'Cliente';
}

function getContractLabel(contract?: SisContableContrato) {
  if (!contract) return 'Contrato sin servicio informado';
  return contract.servicio || `Contrato ${contract.id}`;
}

function getNextPayableInstallment(installments: SisContableCuota[]) {
  return installments
    .filter((installment) => installment.pagable || payableStatuses.includes(installment.estado))
    .sort((a, b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime())[0];
}

function getDueLabel(installment?: SisContableCuota) {
  if (!installment) return 'Sin cuotas pagables';

  const days = daysUntil(installment.fecha_vencimiento);
  if (days === null) return formatDate(installment.fecha_vencimiento);
  if (days < 0) return `Vencida hace ${Math.abs(days)} dias`;
  if (days === 0) return 'Vence hoy';
  if (days === 1) return 'Vence manana';
  return `Vence en ${days} dias`;
}

export default function Portal() {
  const navigate = useNavigate();
  const [session, setSession] = useState(getClientSession);
  const [selectedContractId, setSelectedContractId] = useState(session?.selectedContractId || session?.debts.contratos[0]?.id || '');
  const [installments, setInstallments] = useState<SisContableInstallmentsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [billingDocuments, setBillingDocuments] = useState<BillingDocumentSummary[]>([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const selectedContract = useMemo(
    () => session?.debts.contratos.find((contract) => contract.id === selectedContractId),
    [selectedContractId, session]
  );

  const nextInstallment = useMemo(
    () => getNextPayableInstallment(installments?.cuotas || []),
    [installments]
  );

  const paidInstallments = installments?.cuotas.filter((installment) => installment.estado === 'PAGADA') || [];
  const pendingInstallments = installments?.cuotas.filter((installment) => installment.estado !== 'PAGADA') || [];
  const progress = installments?.resumen.total_cuotas
    ? Math.round((installments.resumen.cuotas_pagadas / installments.resumen.total_cuotas) * 100)
    : 0;

  useEffect(() => {
    if (!session) {
      navigate('/client/login', { replace: true });
      return;
    }

    if (!selectedContractId) {
      setErrorMessage('Este cliente no tiene contratos asociados para consultar cuotas.');
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage('');

    fetchContractInstallments(selectedContractId)
      .then((data) => {
        if (cancelled) return;
        setInstallments(data);
        saveClientSession({ ...session, selectedContractId });
      })
      .catch((error: any) => {
        if (cancelled) return;
        setInstallments(null);
        setErrorMessage(error.message || 'No fue posible cargar las cuotas del contrato.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, selectedContractId, session]);

  useEffect(() => {
    if (!session) return;
    fetchBillingDocuments()
      .then((data) => setBillingDocuments(data.documents || []))
      .catch(() => setBillingDocuments([]));
  }, [session]);

  const handleContractChange = (contractId: string) => {
    setSelectedContractId(contractId);
    if (session) {
      const updatedSession = { ...session, selectedContractId: contractId };
      setSession(updatedSession);
      saveClientSession(updatedSession);
    }
  };

  const handlePayInstallment = () => {
    if (!session || !selectedContract || !nextInstallment || !installments) return;

    saveSelectedPayment({
      identifier: session.identifier,
      cliente_contable_id: session.debts.cliente.id,
      contrato_contable_id: selectedContract.id,
      cuota_ids: [nextInstallment.id],
      amount: nextInstallment.saldo || nextInstallment.monto,
      description: `${getContractLabel(selectedContract)} - Cuota ${nextInstallment.numero}/${installments.resumen.total_cuotas}`,
      installmentNumber: nextInstallment.numero,
      totalInstallments: installments.resumen.total_cuotas,
    });

    navigate('/client/payment');
  };

  const handlePasswordUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;

    if (!/^[a-zA-Z0-9]{6}$/.test(currentPassword) || !/^[a-zA-Z0-9]{6}$/.test(newPassword)) {
      setPasswordMessage('Las claves deben tener 6 caracteres alfanumericos.');
      return;
    }

    setIsUpdatingPassword(true);
    setPasswordMessage('');
    try {
      await updateClientPassword({
        identifier: session.identifier,
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMessage('Clave actualizada correctamente.');
    } catch (error: any) {
      setPasswordMessage(error.message || 'No fue posible actualizar la clave.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  if (!session) return null;

  return (
    <main className="flex-grow w-full max-w-md mx-auto px-4 py-8 space-y-8 pb-24">
      <section className="space-y-3">
        <div className="space-y-1">
          <h1 className="font-display-lg text-display-lg text-primary font-bold">Hola, {getFirstName(session.debts.cliente.nombre)}</h1>
          <p className="font-body-base text-body-base text-on-surface-variant">
            {session.debts.resumen.cuotas_vencidas > 0
              ? `Tienes ${session.debts.resumen.cuotas_vencidas} cuota(s) vencida(s).`
              : 'Estas viendo tu informacion real de pagos.'}
          </p>
        </div>

        {session.debts.contratos.length > 1 && (
          <label className="block">
            <span className="mb-2 block text-[11px] font-bold uppercase text-on-surface-variant">Contrato</span>
            <select
              className="h-12 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm font-semibold outline-none focus:border-secondary"
              value={selectedContractId}
              onChange={(event) => handleContractChange(event.target.value)}
            >
              {session.debts.contratos.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {getContractLabel(contract)}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section className="bg-white p-5 rounded-xl border border-border-subtle shadow-sm">
        <h2 className="font-label-caps text-label-caps text-on-primary-container mb-4 font-bold">SEGURIDAD DE ACCESO</h2>
        <form className="grid gap-3" onSubmit={handlePasswordUpdate}>
          <div className="grid grid-cols-2 gap-3">
            <input
              className="h-11 rounded-lg border border-border-subtle px-3 text-sm outline-none focus:border-secondary"
              type="password"
              maxLength={6}
              placeholder="Clave actual"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value.toUpperCase())}
            />
            <input
              className="h-11 rounded-lg border border-border-subtle px-3 text-sm outline-none focus:border-secondary"
              type="password"
              maxLength={6}
              placeholder="Nueva clave"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value.toUpperCase())}
            />
          </div>
          <button
            className="h-11 rounded-lg bg-primary-container text-sm font-semibold text-white disabled:opacity-60"
            disabled={isUpdatingPassword}
            type="submit"
          >
            {isUpdatingPassword ? 'Actualizando...' : 'Cambiar clave'}
          </button>
          {passwordMessage && <p className="text-xs font-semibold text-on-surface-variant">{passwordMessage}</p>}
        </form>
      </section>

      <section className="bg-white p-6 rounded-xl border border-border-subtle shadow-sm">
        <h2 className="font-label-caps text-label-caps text-on-primary-container mb-6 font-bold">ESTADO DEL CONTRATO</h2>
        <p className="text-body-sm text-primary font-semibold mt-1 mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          {getContractLabel(selectedContract)} - {selectedContract?.estado || installments?.estado_contrato || 'Sin estado'}
        </p>
        <div className="relative">
          <div className="absolute top-4 left-0 w-full h-1 bg-surface-container-high -z-0"></div>
          <div className="absolute top-4 left-0 h-1 bg-success-green -z-0" style={{ width: `${Math.min(progress, 100)}%` }}></div>
          <div className="flex justify-between relative z-10">
            {[
              ['INICIO', progress >= 1],
              ['PAGOS', progress >= 34],
              ['ACTUAL', true],
              ['CIERRE', progress >= 100],
            ].map(([label, completed]) => (
              <div key={String(label)} className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center',
                    completed ? 'bg-success-green text-white' : 'bg-surface-container-high text-on-surface-variant'
                  )}
                >
                  {completed ? <Check className="w-4 h-4 stroke-[3]" /> : <Flag className="w-4 h-4" />}
                </div>
                <span className="font-label-caps text-[10px] text-on-surface-variant font-bold">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {errorMessage && (
        <section className="rounded-xl border border-error-red/30 bg-error-red/10 p-4 text-error-red">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-semibold">{errorMessage}</p>
          </div>
        </section>
      )}

      <section className="bg-primary-container text-white p-8 rounded-xl relative overflow-hidden shadow-lg border-t-4 border-secondary">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Wallet className="w-32 h-32" />
        </div>
        <div className="relative z-10 space-y-6">
          <div className="flex justify-between items-start gap-3">
            <div className="space-y-1">
              <p className="font-label-caps text-[12px] text-on-primary-container font-bold">CUOTA ACTUAL</p>
              <h3 className="font-headline-md text-2xl font-bold">
                {nextInstallment ? `Cuota ${nextInstallment.numero} de ${installments?.resumen.total_cuotas || selectedContract?.total_cuotas || '-'}` : 'Sin cuota disponible'}
              </h3>
            </div>
            <span className="bg-warning-orange/20 text-warning-orange px-3 py-1 rounded-full text-[12px] font-bold border border-warning-orange/30">
              {getDueLabel(nextInstallment)}
            </span>
          </div>
          <div className="space-y-1">
            <p className="font-label-caps text-[12px] text-on-primary-container font-bold">MONTO A PAGAR</p>
            <div className="flex items-baseline gap-1">
              <span className="font-display-lg text-[40px] font-bold tracking-tight">
                {formatCurrency(nextInstallment?.saldo || nextInstallment?.monto || 0)}
              </span>
              <span className="font-body-sm text-on-primary-container font-medium">CLP</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handlePayInstallment}
            disabled={!nextInstallment || isLoading}
            className="w-full bg-secondary hover:bg-secondary/90 text-white font-headline-md py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 font-bold text-lg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Wallet className="w-6 h-6" />}
            Pagar Cuota Ahora
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl border border-border-subtle flex flex-col justify-between">
          <Calendar className="w-6 h-6 text-secondary" />
          <div className="mt-4">
            <p className="font-label-caps text-[10px] text-on-surface-variant uppercase font-bold">Proximo Vencimiento</p>
            <p className="font-numeric-data text-lg font-bold">{formatDate(nextInstallment?.fecha_vencimiento || '')}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-border-subtle flex flex-col justify-between">
          <Verified className="w-6 h-6 text-success-green" />
          <div className="mt-4">
            <p className="font-label-caps text-[10px] text-on-surface-variant uppercase font-bold">Total Pagado</p>
            <p className="font-numeric-data text-lg font-bold leading-tight">
              {formatCurrency(installments?.resumen.monto_pagado || 0)} /<br />
              {formatCurrency(installments?.resumen.monto_total || selectedContract?.monto_pendiente || 0)}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <h2 className="font-headline-md text-base font-bold text-primary uppercase tracking-wider">Historial de Pagos</h2>
          <span className="text-secondary font-label-caps text-[12px] font-bold">{installments?.cuotas.length || 0} cuotas</span>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border-subtle bg-white p-5 text-sm font-semibold text-on-surface-variant">
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando cuotas reales
          </div>
        )}

        {!isLoading && installments && (
          <div className="space-y-3">
            {paidInstallments.slice(0, 2).map((installment) => (
              <div key={installment.id} className="flex items-center justify-between p-4 bg-white border border-border-subtle rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="bg-success-green/10 p-2 rounded-lg">
                    <CheckCircle2 className="w-6 h-6 text-success-green fill-success-green/20" />
                  </div>
                  <div>
                    <p className="font-body-base font-bold text-sm">Cuota {installment.numero}</p>
                    <p className="font-body-sm text-on-surface-variant text-xs">Pagada - vencimiento {formatDate(installment.fecha_vencimiento)}</p>
                  </div>
                </div>
                <p className="font-numeric-data text-base font-bold text-success-green">+{formatCurrency(installment.monto_pagado || installment.monto)}</p>
              </div>
            ))}

            {pendingInstallments.slice(0, 4).map((installment) => (
              <details key={installment.id} className="group bg-white border border-border-subtle rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
                  <div className="flex items-center gap-4">
                    <div className={cn('p-2 rounded-lg', installment.pagable ? 'bg-secondary/10' : 'bg-surface-container-high')}>
                      {installment.pagable ? <Clock className="w-6 h-6 text-secondary" /> : <Lock className="w-6 h-6 text-outline" />}
                    </div>
                    <div>
                      <p className="font-body-base font-bold text-sm">Cuota {installment.numero}</p>
                      <p className="font-body-sm text-on-surface-variant text-xs">
                        {installment.estado} - vence {formatDate(installment.fecha_vencimiento)}
                      </p>
                    </div>
                  </div>
                  <ChevronDown className="w-6 h-6 text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-4 pb-4 border-t border-dashed border-border-subtle pt-4 space-y-2">
                  <div className="flex justify-between text-body-sm">
                    <span className="text-on-surface-variant">Monto</span>
                    <span className="font-numeric-data font-bold">{formatCurrency(installment.monto)}</span>
                  </div>
                  <div className="flex justify-between text-body-sm">
                    <span className="text-on-surface-variant">Saldo</span>
                    <span className="font-numeric-data font-bold">{formatCurrency(installment.saldo)}</span>
                  </div>
                  <p className="text-[12px] text-on-surface-variant italic">
                    {installment.pagable ? 'Esta cuota esta habilitada para pago.' : 'Esta cuota no esta habilitada para pago.'}
                  </p>
                </div>
              </details>
            ))}

            {installments.cuotas.length === 0 && (
              <div className="flex items-center justify-between p-4 bg-surface-container-lowest border border-border-subtle rounded-xl opacity-80">
                <div className="flex items-center gap-4">
                  <div className="bg-surface-container-high p-2 rounded-lg">
                    <MoreHorizontal className="w-6 h-6 text-outline" />
                  </div>
                  <div>
                    <p className="font-body-base font-bold text-outline text-sm">Sin cuotas</p>
                    <p className="font-body-sm text-on-surface-variant text-xs">El sistema contable no envio cuotas para este contrato.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {billingDocuments.length > 0 && (
        <section className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h2 className="font-headline-md text-base font-bold text-primary uppercase tracking-wider">Documentos tributarios</h2>
            <span className="text-secondary font-label-caps text-[12px] font-bold">{billingDocuments.length} DTE</span>
          </div>
          <div className="space-y-3">
            {billingDocuments.slice(0, 4).map((document) => (
              <div key={document.id} className="flex items-center justify-between p-4 bg-white border border-border-subtle rounded-xl">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="bg-secondary/10 p-2 rounded-lg">
                    <FileText className="w-6 h-6 text-secondary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-body-base font-bold text-sm truncate">
                      {document.document_type.replace('_', ' ')} {document.folio ? `#${document.folio}` : ''}
                    </p>
                    <p className="font-body-sm text-on-surface-variant text-xs">
                      {document.status} - {formatCurrency(Number(document.total_amount || 0))}
                    </p>
                  </div>
                </div>
                {document.pdf_url && (
                  <a
                    href={document.pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-secondary"
                  >
                    PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <Link to="/client/login" className="block text-center text-sm font-semibold text-secondary">
        Consultar otro cliente
      </Link>
    </main>
  );
}
