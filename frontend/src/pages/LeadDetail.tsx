import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getLead, getLeadHistory, downloadLeadPdf,
  updateLead, moveLeadStage,
} from '../api'
import type { Lead, LeadHistory } from '../types'
import { STAGE_LABELS, STAGE_COLORS, STAGE_DOT } from '../types'
import {
  ArrowLeft,
  Download, User, Briefcase, DollarSign, X, FileText, StickyNote, Phone, Mail, ClipboardList, Pencil, ArrowRight,
} from 'lucide-react'
import { MoveLeadModal } from '../components/MoveLeadModal'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseDate } from '../utils/dates'
import { useAuthStore } from '../store/auth'
import { WorkOrderModal } from '../components/WorkOrderModal'
import { EditContactModal } from '../components/EditContactModal'

function fmt(n: number) { return `$${Math.round(n).toLocaleString('es-CL')}` }


function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between py-2 last:border-0 gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
      <dt className="text-xs font-medium flex-shrink-0 w-32" style={{ color: 'var(--text-muted)' }}>{label}</dt>
      <dd className="text-sm font-semibold text-right" style={{ color: 'var(--text)' }}>{value}</dd>
    </div>
  )
}

interface LeadDetailViewProps {
  leadId: number
  onClose?: () => void
}

export function LeadDetailView({ leadId, onClose }: LeadDetailViewProps) {
  const navigate   = useNavigate()
  const { user }   = useAuthStore()
  const [lead, setLead]         = useState<Lead | null>(null)
  const [history, setHistory]   = useState<LeadHistory[]>([])
  const [loading, setLoading]   = useState(true)
  const [localNotes, setLocalNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [showOTModal, setShowOTModal] = useState(false)
  const [showEditContact, setShowEditContact] = useState(false)
  const [showMoveModal, setShowMoveModal] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [l, h] = await Promise.all([getLead(leadId), getLeadHistory(leadId)])
      setLead(l); setHistory(h)
      setLocalNotes(l.notes || '')
    } catch { toast.error('Error cargando lead') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadAll() }, [leadId])

  const handleUpdateNotes = async () => {
    if (!lead || localNotes === (lead.notes || '')) return
    setSavingNotes(true)
    try {
      const updated = await updateLead(lead.id, { notes: localNotes })
      setLead(updated)
      toast.success('Notas actualizadas')
    } catch {
      toast.error('Error al guardar notas')
      setLocalNotes(lead.notes || '')
    } finally {
      setSavingNotes(false)
    }
  }

  const handleBack = () => {
    if (onClose) onClose()
    else navigate(-1)
  }

  const handleMove = async (stage: string) => {
    if (!lead) return
    const updated = await moveLeadStage(lead.id, { stage })
    setLead(updated)
    await loadAll()
    setShowMoveModal(false)
  }

  const canConfirmPago = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'vendedor'
  const canMove        = user?.role !== 'verificador'

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
    </div>
  )
  if (!lead) return <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>Lead no encontrado</div>

  const latestHistoryWithNote = [...history].reverse().find(h => h.notes)

  const content = (
    <div className="space-y-4">

      {/* Single horizontal header bar */}
      <div className="bg-surface-1 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap" style={{ border: '1px solid var(--border)' }}>
        <button onClick={handleBack}
          className="p-2 rounded-lg hover:bg-surface-2 transition-colors flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
          {onClose ? <X size={18} /> : <ArrowLeft size={18} />}
        </button>

        {/* Name + stage + contact */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base font-bold text-white leading-tight">{lead.contact?.name}</h1>
            <span className={`badge border text-[11px] ${STAGE_COLORS[lead.current_stage] ?? 'bg-surface-2 text-white/78'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${STAGE_DOT[lead.current_stage] ?? 'bg-white/30'}`} />
              {STAGE_LABELS[lead.current_stage] ?? lead.current_stage}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] mt-0.5 flex-wrap" style={{ color: 'var(--text-muted)' }}>
            {lead.contact?.phone && <span className="flex items-center gap-1"><Phone size={10} />{lead.contact.phone}</span>}
            {lead.contact?.email && <span className="flex items-center gap-1"><Mail size={10} />{lead.contact.email}</span>}
            <span>·</span>
            <span>Lead #{lead.id}</span>
          </div>
        </div>

<button onClick={() => setShowOTModal(true)}
          className="btn-secondary text-xs py-1.5 px-3 gap-1.5 flex-shrink-0">
          <ClipboardList size={13} /> OT
        </button>
        <button onClick={() => downloadLeadPdf(lead.id, lead.contact?.name).catch(() => toast.error('Error'))}
          className="btn-secondary text-xs py-1.5 px-3 gap-1.5 flex-shrink-0">
          <Download size={13} /> PDF
        </button>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Client data */}
        <div className="bg-surface-1 rounded-xl p-5" style={{ border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-surface-2 rounded-lg flex items-center justify-center">
              <User size={13} style={{ color: 'var(--primary)' }} />
            </div>
            <h3 className="font-semibold text-sm flex-1" style={{ color: 'var(--text)' }}>Datos del Cliente</h3>
            <button onClick={() => setShowEditContact(true)}
              className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors" style={{ color: 'var(--text-muted)' }} title="Editar contacto">
              <Pencil size={13} />
            </button>
          </div>
          <dl>
            <InfoRow label="Nombre"       value={lead.contact?.name} />
            <InfoRow label="Teléfono"     value={lead.contact?.phone} />
            <InfoRow label="Email"        value={lead.contact?.email} />
            <InfoRow label="RUT Cliente"  value={lead.contact?.rut_persona} />
            <InfoRow label="RUT Empresa"  value={lead.contact?.rut_empresa} />
            <InfoRow label="Razón Social" value={lead.contact?.razon_social} />
            <InfoRow label="Domicilio"    value={lead.contact?.address} />
            <InfoRow label="Comuna"       value={lead.contact?.city} />
          </dl>
        </div>

        {/* Service detail */}
        <div className="bg-surface-1 rounded-xl p-5" style={{ border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-surface-2 rounded-lg flex items-center justify-center">
              <Briefcase size={13} style={{ color: 'var(--primary)' }} />
            </div>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Detalle del Servicio</h3>
          </div>
          <dl>
            <InfoRow label="Área Legal"  value={lead.area?.name} />
            <InfoRow label="Vendedor"    value={lead.vendedor?.name} />
            <InfoRow label="Agendador/a"  value={lead.agendadora?.name} />
            <InfoRow label="Fuente"      value={lead.source ? lead.source.charAt(0).toUpperCase() + lead.source.slice(1) : null} />
            <InfoRow label="Prioridad"   value={lead.priority === 'high' ? 'Alta' : lead.priority === 'low' ? 'Baja' : 'Normal'} />
          </dl>
          {lead.service_description && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Descripción del servicio</p>
              <p className="text-sm bg-surface-0 rounded-lg p-3 leading-relaxed" style={{ color: 'var(--text-2)' }}>{lead.service_description}</p>
            </div>
          )}
        </div>

        {/* Payment plan */}
        <div className="bg-surface-1 rounded-xl p-5" style={{ border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-surface-2 rounded-lg flex items-center justify-center">
              <DollarSign size={13} style={{ color: 'var(--primary)' }} />
            </div>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Plan de Pago</h3>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              ['Honorarios',    fmt(lead.honorarios)],
              ['Cuota Inicial', fmt(lead.cuota_inicial)],
              ['N° Cuotas',     lead.num_cuotas.toString()],
              ['Monto Cuota',   fmt(lead.monto_cuota)],
            ].map(([l, v]) => (
              <div key={l} className="bg-surface-0 rounded-lg p-3" style={{ border: '1px solid var(--border)' }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{l}</p>
                <p className="text-base font-bold mt-0.5" style={{ color: 'var(--text)' }}>{v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Last action note OR internal notes stacked in right column */}
        <div className="space-y-4">
          {latestHistoryWithNote && (
            <div className="bg-surface-1 rounded-xl p-5" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary-dim)' }}>
                  <StickyNote size={13} style={{ color: 'var(--primary)' }} />
                </div>
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Última Gestión</h3>
              </div>
              <div className="bg-surface-0 rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
                <p className="text-sm leading-relaxed italic" style={{ color: 'var(--text-2)' }}>"{latestHistoryWithNote.notes}"</p>
                <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <span className={`badge border text-[10px] ${STAGE_COLORS[latestHistoryWithNote.to_stage]}`}>
                    {STAGE_LABELS[latestHistoryWithNote.to_stage]}
                  </span>
                  <span className="text-[10px] font-medium italic" style={{ color: 'var(--text-muted)' }}>
                    {latestHistoryWithNote.creator?.name} · {format(parseDate(latestHistoryWithNote.created_at), "d MMM yyyy · HH:mm", { locale: es })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Internal notes */}
          <div className="bg-surface-1 rounded-xl p-5" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-surface-2 rounded-lg flex items-center justify-center">
                  {savingNotes ? (
                    <div className="w-3 h-3 border rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
                  ) : (
                    <FileText size={13} style={{ color: 'var(--primary)' }} />
                  )}
                </div>
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Notas Internas</h3>
              </div>
              {savingNotes && <span className="text-[10px] animate-pulse" style={{ color: 'var(--text-muted)' }}>Guardando...</span>}
            </div>
            <textarea
              value={localNotes}
              onChange={e => setLocalNotes(e.target.value)}
              onBlur={handleUpdateNotes}
              className="w-full text-sm bg-surface-0 rounded-xl p-3.5 leading-relaxed focus:outline-none focus:ring-2 resize-none transition-all"
              style={{ color: 'var(--text-2)', border: '1px solid var(--border)', '--tw-ring-color': 'var(--primary-dim)' } as any}
              placeholder="Escribe notas internas aquí... (se guardan automáticamente al salir)"
              rows={5}
            />
          </div>
        </div>
      </div>

    </div>
  )

  if (onClose) {
    return (
      <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
        <div className="bg-surface-1 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto p-5" style={{ border: '1px solid var(--border)' }}>
          {content}
        </div>
        {showOTModal && <WorkOrderModal leadId={leadId} honorarios={lead?.honorarios ?? 0} onClose={() => setShowOTModal(false)} autoOpen />}
        {showEditContact && lead?.contact && <EditContactModal contact={lead.contact} onClose={() => setShowEditContact(false)} onSuccess={c => { setLead(l => l ? { ...l, contact: c } : l); setShowEditContact(false) }} />}
        {showMoveModal && lead && <MoveLeadModal lead={lead} targetStage="" labels={STAGE_LABELS} canConfirmPago={canConfirmPago} userRole={user?.role} onConfirm={handleMove} onClose={() => setShowMoveModal(false)} />}
      </div>
    )
  }

  return (
    <div className="w-full">
      {content}
      {showOTModal && <WorkOrderModal leadId={leadId} honorarios={lead?.honorarios ?? 0} onClose={() => setShowOTModal(false)} autoOpen />}
      {showEditContact && lead?.contact && <EditContactModal contact={lead.contact} onClose={() => setShowEditContact(false)} onSuccess={c => { setLead(l => l ? { ...l, contact: c } : l); setShowEditContact(false) }} />}
      {showMoveModal && lead && <MoveLeadModal lead={lead} targetStage="" labels={STAGE_LABELS} canConfirmPago={canConfirmPago} userRole={user?.role} onConfirm={handleMove} onClose={() => setShowMoveModal(false)} />}
    </div>
  )
}

export default function LeadDetail() {
  const { id } = useParams()
  if (!id) return <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>Lead no encontrado</div>
  return <LeadDetailView leadId={parseInt(id)} />
}
