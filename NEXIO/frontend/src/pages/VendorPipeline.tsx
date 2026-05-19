import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { XCircle, ThumbsUp, MoreVertical, Link2, RefreshCw, Phone, Calendar, Clock, FileText, ChevronDown, WifiOff, ClipboardList, CheckCircle, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { parseLocalDate as parseAsUTC } from '../utils/dates'
import toast from 'react-hot-toast'
import { getVendorPipeline, updateVendorStatus } from '../api'
import { EventModal } from '../components/EventModal'
import { WorkOrderModal } from '../components/WorkOrderModal'

function fmt(n: number) { return `$${Math.round(n).toLocaleString('es-CL')}` }

const AVATAR_GRADS = [
  'linear-gradient(135deg,#4361ee 0%,#3a0ca3 100%)',
  'linear-gradient(135deg,#7c3aed 0%,#4c1d95 100%)',
  'linear-gradient(135deg,#0891b2 0%,#164e63 100%)',
  'linear-gradient(135deg,#059669 0%,#064e3b 100%)',
  'linear-gradient(135deg,#d97706 0%,#92400e 100%)',
]

function LeadPipelineCard({ lead, onOT }: { lead: any; onOT: (leadId: number) => void }) {
  const avatarGrad = AVATAR_GRADS[(lead.contact_name?.charCodeAt(0) ?? 0) % AVATAR_GRADS.length]
  const isPago = lead.current_stage === 'pago_comprometido'
  const borderColor = isPago ? '#22c55e' : '#4361ee'
  const tagBg    = isPago ? 'rgba(34,197,94,0.12)'  : 'rgba(67,97,238,0.12)'
  const tagColor = isPago ? '#16a34a'                : '#4361ee'
  const accent   = isPago ? '#16a34a'                : '#4361ee'

  const daysIn = lead.created_at
    ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)
    : 0
  const isHot  = daysIn >= 5
  const isWarm = daysIn >= 2 && daysIn < 5

  return (
    <div className="group rounded-xl overflow-hidden transition-all duration-200"
      style={{
        background: `color-mix(in srgb, ${borderColor} 5%, #ffffff)`,
        border: `2px solid ${borderColor}`,
        boxShadow: `0 2px 8px rgba(26,32,53,0.06), 0 0 0 1px ${borderColor}40`,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 6px 16px rgba(26,32,53,0.10), 0 0 0 2px ${borderColor}60`; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 2px 8px rgba(26,32,53,0.06), 0 0 0 1px ${borderColor}40`; (e.currentTarget as HTMLElement).style.transform = 'none' }}>

      {/* Stage tag + days */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ background: tagBg, color: tagColor }}>
          {isPago ? 'Pago Comprometido' : 'Cierre'}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-0.5 text-[9px] font-semibold"
            style={{ color: isHot ? '#dc2626' : isWarm ? '#d97706' : 'rgba(26,32,53,0.40)' }}>
            <Clock size={8} />{daysIn}d
          </span>
          <Link to={`/leads/${lead.lead_id}`}
            className="w-6 h-6 rounded-lg flex items-center justify-center transition-all"
            style={{ background: 'rgba(26,32,53,0.05)', color: 'rgba(26,32,53,0.40)', border: '1px solid rgba(26,32,53,0.10)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(26,32,53,0.10)'; (e.currentTarget as HTMLElement).style.color = '#1a2035' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(26,32,53,0.05)'; (e.currentTarget as HTMLElement).style.color = 'rgba(26,32,53,0.40)' }}>
            <Link2 size={10} />
          </Link>
        </div>
      </div>

      <div className="px-3 pb-3 space-y-2.5">
        {/* Avatar + name */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-sm text-white"
            style={{ background: avatarGrad, boxShadow: '0 3px 8px rgba(0,0,0,0.16)' }}>
            {lead.contact_name?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm leading-tight truncate" style={{ color: '#1a2035' }}>
              {lead.contact_name ?? '—'}
            </p>
            {lead.contact_phone && (
              <p className="text-[10px] font-mono truncate mt-0.5 font-medium" style={{ color: 'rgba(26,32,53,0.48)' }}>
                {lead.contact_phone}
              </p>
            )}
          </div>
        </div>

        {/* Financial */}
        <div className="rounded-lg px-2.5 py-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'rgba(26,32,53,0.42)' }}>Honorarios</span>
            {lead.honorarios > 0
              ? <span className="text-[12px] font-black" style={{ color: accent }}>{fmt(lead.honorarios)}</span>
              : <span className="text-[9px] italic" style={{ color: 'rgba(26,32,53,0.35)' }}>Sin definir</span>
            }
          </div>
          {lead.honorarios > 0 && lead.num_cuotas > 1 && (
            <div className="flex items-center justify-between mt-1">
              <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'rgba(26,32,53,0.42)' }}>{lead.num_cuotas} cuotas de</span>
              <span className="text-[10px] font-bold" style={{ color: '#1a2035' }}>{fmt(lead.monto_cuota)}</span>
            </div>
          )}
          {lead.honorarios > 0 && lead.cuota_inicial > 0 && lead.cuota_inicial !== lead.monto_cuota && lead.num_cuotas > 1 && (
            <div className="flex items-center justify-between mt-1">
              <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'rgba(26,32,53,0.42)' }}>Cuota inicial</span>
              <span className="text-[10px] font-bold" style={{ color: '#1a2035' }}>{fmt(lead.cuota_inicial)}</span>
            </div>
          )}
        </div>

        {/* OT label + button */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest mb-1 px-0.5"
            style={{ color: lead.has_ot ? '#16a34a' : '#dc2626' }}>
            {lead.has_ot ? 'No requiere OT' : 'Requiere OT'}
          </p>
          <button onClick={() => onOT(lead.lead_id)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold transition-all"
            style={{
              background: lead.has_ot ? 'rgba(34,197,94,0.10)' : '#1e293b',
              color: lead.has_ot ? '#16a34a' : '#ffffff',
              border: `1px solid ${lead.has_ot ? 'rgba(34,197,94,0.25)' : '#334155'}`,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = lead.has_ot ? 'rgba(34,197,94,0.20)' : '#0f172a' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = lead.has_ot ? 'rgba(34,197,94,0.10)' : '#1e293b' }}>
            {lead.has_ot ? <CheckCircle size={11} /> : <ClipboardList size={11} />}
            {lead.has_ot ? 'Ver / Editar OT' : 'Agregar OT'}
          </button>
        </div>
      </div>
    </div>
  )
}

const COLS = [
  { key: 'espera_cliente',       label: 'En proceso de reunión', dot: 'bg-warn',   header: 'bg-warn/[0.07] border-warn/20',     badge: 'bg-warn/15 text-warn' },
  { key: 'altamente_interesado', label: 'Altamente Interesado',  dot: 'bg-lime',   header: 'bg-lime/[0.07] border-lime/20',     badge: 'bg-lime/15 text-lime' },
  { key: 'sin_exito',            label: 'Sin Éxito / No Conectó',dot: 'bg-danger', header: 'bg-danger/[0.07] border-danger/20', badge: 'bg-danger/15 text-danger' },
]

const OUTCOME_CONFIG: Record<string, { label: string; desc: string; color: string; btnClass: string; badgeClass: string; icon: React.ReactNode }> = {
  no_show:               { label: 'No se conectó',        desc: 'El cliente no se presentó a la reunión.',         color: 'warn',   btnClass: 'hover:bg-warn/10 hover:text-warn border-warn/30 text-warn',     badgeClass: 'bg-warn/10 text-warn border-warn/20',   icon: <WifiOff size={10}/> },
  sin_exito:             { label: 'Se conectó y no cerró',desc: 'El cliente asistió pero no se llegó a un cierre.', color: 'danger', btnClass: 'hover:bg-danger/10 hover:text-danger border-danger/30 text-danger', badgeClass: 'bg-danger/10 text-danger border-danger/20', icon: <XCircle size={10}/> },
  altamente_interesado:  { label: 'Se conectó y cerró',   desc: 'El cliente asistió y se logró el cierre.',         color: 'lime',   btnClass: 'hover:bg-lime/10 hover:text-lime border-lime/30 text-lime',       badgeClass: 'bg-lime/10 text-lime border-lime/20',   icon: <ThumbsUp size={10}/> },
}

function OutcomeModal({ outcome, onConfirm, onCancel }: {
  outcome: string
  onConfirm: (notes: string) => Promise<void>
  onCancel: () => void
}) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const cfg = OUTCOME_CONFIG[outcome]

  const confirm = async () => {
    setSaving(true)
    try { await onConfirm(notes) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-surface-1 rounded-2xl border border-white/10 w-full max-w-sm shadow-2xl overflow-hidden">
        <div className={`px-5 py-4 border-b border-white/[0.07] flex items-center gap-3`}>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.badgeClass} border`}>
            {cfg.icon}
          </div>
          <div>
            <p className="font-bold text-white text-sm">{cfg.label}</p>
            <p className="text-[11px] text-white/52 mt-0.5">{cfg.desc}</p>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-[10px] font-bold text-white/45 uppercase tracking-widest block mb-1.5">Notas del resultado</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ej: El cliente pidió más tiempo para decidir..."
              rows={3}
              autoFocus
              className="w-full bg-surface-0 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/90 placeholder-white/30 resize-none focus:outline-none focus:border-white/25"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onCancel} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/62 bg-surface-0 hover:bg-surface-2 border border-white/10 transition-colors">
              Cancelar
            </button>
            <button onClick={confirm} disabled={saving}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors border ${cfg.badgeClass} hover:opacity-90`}>
              {saving ? 'Guardando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EventCard({ ev, onMark, onEdit }: { ev: any; onMark: (id: number, s: string, notes?: string) => Promise<void>; onEdit: (ev: any) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [pendingOutcome, setPendingOutcome] = useState<string | null>(null)
  const [showOT, setShowOT] = useState(false)

  const handleConfirm = async (notes: string) => {
    await onMark(ev.id, pendingOutcome!, notes || undefined)
    setPendingOutcome(null)
  }

  const start = parseAsUTC(ev.start_time)
  const end   = parseAsUTC(ev.end_time)

  return (
    <div className="bg-surface-1 rounded-xl border border-white/[0.07] shadow-sm p-3 space-y-2.5 hover:border-white/10 transition-all">

      {/* Header row */}
      <div className="flex items-start gap-2 justify-between">
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onEdit(ev)}>
          <p className="font-semibold text-white/90 text-sm truncate">{ev.title}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {ev.lead_id && (
            <>
              <button
                onClick={() => setShowOT(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors"
                style={{ background: 'rgba(204,255,0,0.08)', color: '#CCFF00', border: '1px solid rgba(204,255,0,0.2)' }}
                title="Crear / ver OT">
                <ClipboardList size={11} /> OT
              </button>
              <Link to={`/leads/${ev.lead_id}`}
                className="p-1.5 hover:bg-surface-2 rounded-lg text-white/52 transition-colors" title="Ver lead">
                <Link2 size={12} />
              </Link>
            </>
          )}
          <button onClick={() => onEdit(ev)} className="p-1.5 hover:bg-surface-2 rounded-lg text-white/52 transition-colors">
            <MoreVertical size={12} />
          </button>
        </div>
      </div>

      {/* Client info */}
      {ev.contact_name && (
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-white/78">
            {ev.contact_name.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs font-semibold text-white/85 truncate">{ev.contact_name}</span>
        </div>
      )}

      {ev.contact_phone && (
        <a href={`tel:${ev.contact_phone}`}
          className="flex items-center gap-1.5 text-[11px] text-lime hover:text-lime/70 transition-colors">
          <Phone size={11} className="flex-shrink-0" />
          <span className="font-mono">{ev.contact_phone}</span>
        </a>
      )}

      {/* Date / time */}
      <div className="flex items-center gap-1.5 text-[11px] text-white/62">
        <Calendar size={11} className="flex-shrink-0 text-white/52" />
        <span className="font-semibold">{format(start, "d MMM yyyy", { locale: es })}</span>
        <Clock size={10} className="flex-shrink-0 text-white/52 ml-1" />
        <span>{format(start, 'HH:mm')} – {format(end, 'HH:mm')}</span>
      </div>

      {/* Notes preview */}
      {ev.notes && (
        <div className="text-[11px] text-white/52 leading-relaxed">
          {expanded ? (
            <>
              <p className="whitespace-pre-wrap">{ev.notes}</p>
              <button onClick={() => setExpanded(false)} className="text-neon/70 hover:text-neon mt-0.5">menos ▲</button>
            </>
          ) : (
            <button
              onClick={() => setExpanded(true)}
              className="flex items-start gap-1 text-left hover:text-white/78 transition-colors"
            >
              <FileText size={10} className="flex-shrink-0 mt-0.5" />
              <span className="line-clamp-2">{ev.notes}</span>
            </button>
          )}
        </div>
      )}

      {/* Creator */}
      {ev.creator_name && (
        <p className="text-[10px] text-white/38">Agendado por {ev.creator_name}</p>
      )}

      {/* Status badge for already-resolved events */}
      {ev.vendor_status && OUTCOME_CONFIG[ev.vendor_status] && (
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${OUTCOME_CONFIG[ev.vendor_status].badgeClass}`}>
          {OUTCOME_CONFIG[ev.vendor_status].icon}
          {OUTCOME_CONFIG[ev.vendor_status].label}
        </div>
      )}

      {/* Action buttons — only if not yet marked */}
      {!ev.vendor_status && (
        <div className="pt-1 border-t border-white/5 flex flex-col gap-1">
          {(['no_show', 'sin_exito', 'altamente_interesado'] as const).map(key => (
            <button key={key} onClick={() => setPendingOutcome(key)}
              className={`w-full text-[11px] py-2 px-3 rounded-lg font-semibold flex items-center gap-2 transition-colors bg-surface-0 border border-white/[0.07] ${OUTCOME_CONFIG[key].btnClass}`}>
              {OUTCOME_CONFIG[key].icon}
              {OUTCOME_CONFIG[key].label}
            </button>
          ))}
        </div>
      )}

      {/* Outcome modal */}
      {pendingOutcome && (
        <OutcomeModal
          outcome={pendingOutcome}
          onConfirm={handleConfirm}
          onCancel={() => setPendingOutcome(null)}
        />
      )}

      {/* OT modal */}
      {showOT && ev.lead_id && (
        <WorkOrderModal leadId={ev.lead_id} onClose={() => setShowOT(false)} />
      )}
    </div>
  )
}

function HistorialTable({ items }: { items: any[] }) {
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-surface-1 text-sm font-semibold text-white/70 hover:text-white hover:bg-surface-0 transition-all w-full"
      >
        <ChevronDown size={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        <span>Historial (últimas 24h+)</span>
        <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/60">{items.length}</span>
      </button>

      {open && (
        <div className="mt-3 rounded-xl overflow-hidden border border-white/[0.07]">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-4 py-2.5 font-bold text-white/45 uppercase tracking-widest text-[10px]">Fecha</th>
                <th className="text-left px-4 py-2.5 font-bold text-white/45 uppercase tracking-widest text-[10px]">Cliente</th>
                <th className="text-left px-4 py-2.5 font-bold text-white/45 uppercase tracking-widest text-[10px]">Reunión</th>
                <th className="text-left px-4 py-2.5 font-bold text-white/45 uppercase tracking-widest text-[10px]">Resultado</th>
                <th className="text-left px-4 py-2.5 font-bold text-white/45 uppercase tracking-widest text-[10px]">Agendó</th>
              </tr>
            </thead>
            <tbody>
              {items.map((ev, i) => {
                const isExitoso = ev.vendor_status === 'altamente_interesado'
                const isNoShow = ev.vendor_status === 'no_show'
                return (
                  <tr key={ev.id}
                    style={{
                      background: i % 2 === 0 ? 'var(--surface-2)' : 'transparent',
                      borderBottom: '1px solid var(--border)',
                    }}>
                    <td className="px-4 py-2.5 text-white/55 whitespace-nowrap">
                      {format(new Date(ev.start_time), "d MMM yyyy HH:mm", { locale: es })}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-bold text-white/70 flex-shrink-0">
                          {ev.contact_name?.charAt(0)?.toUpperCase() ?? '?'}
                        </div>
                        <span className="font-semibold text-white/80 truncate max-w-[120px]">{ev.contact_name ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-white/60 truncate max-w-[140px] block">{ev.title}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isExitoso ? 'bg-lime/15 text-lime' : isNoShow ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger'
                      }`}>
                        {isExitoso ? <ThumbsUp size={9} /> : isNoShow ? <WifiOff size={9} /> : <XCircle size={9} />}
                        {isExitoso ? 'Exitoso' : isNoShow ? 'No conectó' : 'Sin éxito'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-white/40">{ev.creator_name ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function VendorPipeline() {
  const [pipeline, setPipeline] = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<any>(null)
  const [showModal, setShowModal]         = useState(false)
  const [otLeadId, setOtLeadId]           = useState<number | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try { setPipeline(await getVendorPipeline()) }
    catch { toast.error('Error cargando pipeline') }
    finally { if (!silent) setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => load(true), 30000)
    return () => clearInterval(id)
  }, [load])

  const handleMark = async (id: number, status: string, notes?: string) => {
    await updateVendorStatus(id, status, notes)
    await load(true)
  }

  const handleEdit = (ev: any) => { setSelectedEvent(ev); setShowModal(true) }

  const cierreLeads: any[]  = pipeline?.cierre ?? []
  const pagoLeads: any[]    = pipeline?.pago_comprometido ?? []
  const sinOTCount          = [...cierreLeads, ...pagoLeads].filter((l: any) => !l.has_ot).length
  const totalLeads          = cierreLeads.length + pagoLeads.length
  const totalEvents: number = COLS.reduce((a, c) => {
    const items = c.key === 'sin_exito'
      ? (pipeline?.sin_exito?.length ?? 0) + (pipeline?.no_show?.length ?? 0)
      : (pipeline?.[c.key]?.length ?? 0)
    return a + items
  }, 0)

  // Leads already shown in lead columns — hide their events from meeting columns
  const leadIdsWithStage = new Set([...cierreLeads, ...pagoLeads].map((l: any) => l.lead_id))

  const LEAD_COLS = [
    { key: 'cierre',            label: 'Cierre',            items: cierreLeads, accent: '#38bdf8', accentDim: 'rgba(14,165,233,0.12)', border: 'rgba(14,165,233,0.30)' },
    { key: 'pago_comprometido', label: 'Pago Comprometido', items: pagoLeads,   accent: '#a3e635', accentDim: 'rgba(163,230,53,0.12)',  border: 'rgba(163,230,53,0.30)'  },
  ]

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">Mi Pipeline</h1>
          <p className="text-xs text-white/62 mt-0.5">
            {totalLeads} lead{totalLeads !== 1 ? 's' : ''} · {totalEvents} reunión{totalEvents !== 1 ? 'es' : ''}
            {sinOTCount > 0 && <span className="ml-2 text-danger font-bold">· {sinOTCount} sin OT</span>}
          </p>
        </div>
        <button onClick={() => load()} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-surface-1 border border-white/10 rounded-xl font-semibold text-sm hover:bg-surface-0 transition-colors shadow-sm">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {loading && !pipeline ? (
        <div className="flex items-center justify-center flex-1">
          <div className="w-6 h-6 border-2 border-lime border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">

          {/* ── En proceso de reunión ── */}
          {(() => {
            const col = COLS[0] // espera_cliente
            const raw: any[] = (pipeline?.[col.key] as any[]) ?? []
            const items = raw.filter((ev: any) => !leadIdsWithStage.has(ev.lead_id))
            return (
              <div key={col.key} className="flex flex-col flex-shrink-0" style={{ width: 260 }}>
                <div className={`rounded-xl mb-2.5 px-3 py-2.5 flex items-center justify-between border ${col.header}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${col.dot}`} />
                    <p className="font-bold text-xs text-white/90 truncate">{col.label}</p>
                  </div>
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${col.badge}`}>{items.length}</span>
                </div>
                <div className="space-y-2.5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 270px)', minHeight: 50 }}>
                  {items.length === 0
                    ? <div className="text-center py-8 text-xs rounded-xl" style={{ color: 'rgba(26,32,53,0.35)', border: '1.5px dashed #e2e8f0' }}>Sin eventos</div>
                    : items.map((ev: any) => <EventCard key={ev.id} ev={ev} onMark={handleMark} onEdit={ev2 => { setSelectedEvent(ev2); setShowModal(true) }} />)
                  }
                </div>
              </div>
            )
          })()}

          {/* ── Altamente Interesado ── */}
          {(() => {
            const col = COLS[1] // altamente_interesado
            const raw: any[] = (pipeline?.[col.key] as any[]) ?? []
            const items = raw.filter((ev: any) => !leadIdsWithStage.has(ev.lead_id))
            return (
              <div key={col.key} className="flex flex-col flex-shrink-0" style={{ width: 260 }}>
                <div className={`rounded-xl mb-2.5 px-3 py-2.5 flex items-center justify-between border ${col.header}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${col.dot}`} />
                    <p className="font-bold text-xs text-white/90 truncate">{col.label}</p>
                  </div>
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${col.badge}`}>{items.length}</span>
                </div>
                <div className="space-y-2.5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 270px)', minHeight: 50 }}>
                  {items.length === 0
                    ? <div className="text-center py-8 text-xs rounded-xl" style={{ color: 'rgba(26,32,53,0.35)', border: '1.5px dashed #e2e8f0' }}>Sin eventos</div>
                    : items.map((ev: any) => <EventCard key={ev.id} ev={ev} onMark={handleMark} onEdit={ev2 => { setSelectedEvent(ev2); setShowModal(true) }} />)
                  }
                </div>
              </div>
            )
          })()}

          {/* ── Cierre + Pago Comprometido ── */}
          {LEAD_COLS.map(col => (
            <div key={col.key} className="flex flex-col flex-shrink-0" style={{ width: 260 }}>
              <div className="rounded-xl mb-2.5 px-3 py-2.5 flex items-center justify-between"
                style={{
                  background: `color-mix(in srgb, ${col.accent} 8%, #ffffff)`,
                  border: `2px solid ${col.border}`,
                  boxShadow: `0 2px 8px rgba(26,32,53,0.06), 0 0 0 1px ${col.border}40`,
                }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.accent }} />
                  <p className="font-bold text-xs truncate" style={{ color: '#1a2035' }}>{col.label}</p>
                </div>
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: `${col.accent}22`, color: col.accent }}>
                  {col.items.length}
                </span>
              </div>
              <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 270px)', minHeight: 50 }}>
                {col.items.length === 0 ? (
                  <div className="text-center py-8 text-xs rounded-xl"
                    style={{ color: 'rgba(26,32,53,0.35)', border: '1.5px dashed #e2e8f0' }}>
                    Sin leads
                  </div>
                ) : col.items.map((lead: any) => (
                  <LeadPipelineCard key={lead.lead_id} lead={lead} onOT={id => setOtLeadId(id)} />
                ))}
              </div>
            </div>
          ))}

          {/* ── Sin Éxito / No Conectó ── */}
          {(() => {
            const col = COLS[2] // sin_exito
            const raw: any[] = [...(pipeline?.sin_exito ?? []), ...(pipeline?.no_show ?? [])]
            const items = raw.filter((ev: any) => !leadIdsWithStage.has(ev.lead_id))
            return (
              <div key={col.key} className="flex flex-col flex-shrink-0" style={{ width: 260 }}>
                <div className={`rounded-xl mb-2.5 px-3 py-2.5 flex items-center justify-between border ${col.header}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${col.dot}`} />
                    <p className="font-bold text-xs text-white/90 truncate">{col.label}</p>
                  </div>
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${col.badge}`}>{items.length}</span>
                </div>
                <div className="space-y-2.5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 270px)', minHeight: 50 }}>
                  {items.length === 0
                    ? <div className="text-center py-8 text-xs rounded-xl" style={{ color: 'rgba(26,32,53,0.35)', border: '1.5px dashed #e2e8f0' }}>Sin eventos</div>
                    : items.map((ev: any) => <EventCard key={ev.id} ev={ev} onMark={handleMark} onEdit={ev2 => { setSelectedEvent(ev2); setShowModal(true) }} />)
                  }
                </div>
              </div>
            )
          })()}

        </div>
      )}

      <HistorialTable items={pipeline?.historial ?? []} />

      {showModal && (
        <EventModal
          event={selectedEvent}
          vendors={[]}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(true) }}
          onDeleted={() => { setShowModal(false); load(true) }}
        />
      )}

      {otLeadId !== null && (
        <WorkOrderModal leadId={otLeadId} onClose={() => { setOtLeadId(null); load(true) }} />
      )}
    </div>
  )
}
