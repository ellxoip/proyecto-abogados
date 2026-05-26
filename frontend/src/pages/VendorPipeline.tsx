import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  XCircle, ThumbsUp, MoreVertical, Link2, RefreshCw, Phone, Calendar,
  Clock, FileText, ChevronDown, WifiOff, ClipboardList, CheckCircle,
} from 'lucide-react'
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

/* ─── Stage palette ─── */
const STAGE_CFG: Record<string, { label: string; accent: string; accentDim: string; border: string; tagBg: string; tagColor: string }> = {
  lead:                 { label: 'Lead',                accent: '#94a3b8', accentDim: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.35)', tagBg: 'rgba(148,163,184,0.12)', tagColor: '#64748b' },
  reunion:              { label: 'Reunión',             accent: '#3b82f6', accentDim: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.30)',  tagBg: 'rgba(59,130,246,0.10)',  tagColor: '#2563eb' },
  altamente_interesado: { label: 'Altamente Interesado',accent: '#7c3aed', accentDim: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.30)',  tagBg: 'rgba(124,58,237,0.10)',  tagColor: '#7c3aed' },
  cierre:               { label: 'Cierre',              accent: '#38bdf8', accentDim: 'rgba(14,165,233,0.12)',  border: 'rgba(14,165,233,0.30)',  tagBg: 'rgba(14,165,233,0.10)',  tagColor: '#0284c7' },
  pago_comprometido:    { label: 'Pago Comprometido',   accent: '#a3e635', accentDim: 'rgba(163,230,53,0.12)', border: 'rgba(163,230,53,0.30)',  tagBg: 'rgba(163,230,53,0.10)',  tagColor: '#65a30d' },
}

const PIPELINE_STAGES = ['lead', 'reunion', 'altamente_interesado', 'cierre', 'pago_comprometido'] as const

/* ─── LeadCard ─── */
function LeadCard({ lead, onOT }: { lead: any; onOT: (leadId: number) => void }) {
  const cfg = STAGE_CFG[lead.current_stage] ?? STAGE_CFG.lead
  const avatarGrad = AVATAR_GRADS[(lead.contact_name?.charCodeAt(0) ?? 0) % AVATAR_GRADS.length]

  const daysIn = lead.created_at
    ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)
    : 0
  const isHot  = daysIn >= 5
  const isWarm = daysIn >= 2 && daysIn < 5

  const needsOT = (lead.current_stage === 'cierre' || lead.current_stage === 'pago_comprometido') && !lead.has_ot
  const borderColor = needsOT ? '#ef233c' : cfg.accent

  return (
    <div className="group rounded-xl overflow-hidden transition-all duration-200"
      style={{
        background: needsOT ? 'rgba(239,35,60,0.06)' : `color-mix(in srgb, ${borderColor} 5%, #ffffff)`,
        border: `2px solid ${borderColor}`,
        boxShadow: needsOT ? '0 0 0 3px rgba(239,35,60,0.18)' : `0 2px 8px rgba(26,32,53,0.06), 0 0 0 1px ${borderColor}40`,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 6px 16px rgba(26,32,53,0.10), 0 0 0 2px ${borderColor}60`; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = needsOT ? '0 0 0 3px rgba(239,35,60,0.18)' : `0 2px 8px rgba(26,32,53,0.06), 0 0 0 1px ${borderColor}40`; (e.currentTarget as HTMLElement).style.transform = 'none' }}>

      {/* Stage tag + days */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ background: cfg.tagBg, color: cfg.tagColor }}>
          {cfg.label}
        </span>
        <div className="flex items-center gap-1.5">
          {needsOT && (
            <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(239,35,60,0.12)', color: '#ef233c' }}>
              <ClipboardList size={8} /> Sin OT
            </span>
          )}
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
              <p className="text-[10px] font-mono truncate mt-0.5" style={{ color: 'rgba(26,32,53,0.48)' }}>
                {lead.contact_phone}
              </p>
            )}
          </div>
        </div>

        {/* Financial */}
        {lead.honorarios > 0 && (
          <div className="rounded-lg px-2.5 py-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'rgba(26,32,53,0.42)' }}>Honorarios</span>
              <span className="text-[12px] font-black" style={{ color: cfg.accent }}>{fmt(lead.honorarios)}</span>
            </div>
            {lead.honorarios > 0 && lead.num_cuotas > 1 && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'rgba(26,32,53,0.42)' }}>{lead.num_cuotas} cuotas de</span>
                <span className="text-[10px] font-bold" style={{ color: '#1a2035' }}>{fmt(lead.monto_cuota)}</span>
              </div>
            )}
          </div>
        )}

        {/* OT button — cierre/pago only */}
        {(lead.current_stage === 'cierre' || lead.current_stage === 'pago_comprometido') && (
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
        )}
      </div>
    </div>
  )
}

/* ─── Outcome modal ─── */
const OUTCOME_CONFIG: Record<string, { label: string; desc: string; badgeClass: string; btnClass: string; icon: React.ReactNode }> = {
  no_show:              { label: 'No se conectó',         desc: 'El cliente no se presentó.',            badgeClass: 'bg-warn/10 text-warn border-warn/20',     btnClass: 'hover:bg-warn/10 hover:text-warn border-warn/30 text-warn',         icon: <WifiOff size={10}/> },
  sin_exito:            { label: 'Se conectó y no cerró', desc: 'Asistió pero sin cierre.',              badgeClass: 'bg-danger/10 text-danger border-danger/20', btnClass: 'hover:bg-danger/10 hover:text-danger border-danger/30 text-danger', icon: <XCircle size={10}/> },
  altamente_interesado: { label: 'Se conectó y cerró',    desc: 'Asistió y se logró el cierre.',         badgeClass: 'bg-lime/10 text-lime border-lime/20',       btnClass: 'hover:bg-lime/10 hover:text-lime border-lime/30 text-lime',         icon: <ThumbsUp size={10}/> },
}

function OutcomeModal({ outcome, onConfirm, onCancel }: {
  outcome: string; onConfirm: (notes: string) => Promise<void>; onCancel: () => void
}) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const cfg = OUTCOME_CONFIG[outcome]
  const confirm = async () => { setSaving(true); try { await onConfirm(notes) } finally { setSaving(false) } }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-surface-1 rounded-2xl border border-white/10 w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center gap-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.badgeClass} border`}>{cfg.icon}</div>
          <div>
            <p className="font-bold text-white text-sm">{cfg.label}</p>
            <p className="text-[11px] text-white/52 mt-0.5">{cfg.desc}</p>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-[10px] font-bold text-white/45 uppercase tracking-widest block mb-1.5">Notas del resultado</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Ej: El cliente pidió más tiempo..." rows={3} autoFocus
              className="w-full bg-surface-0 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/90 placeholder-white/30 resize-none focus:outline-none focus:border-white/25" />
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

/* ─── EventCard (reuniones pendientes) ─── */
function EventCard({ ev, onMark, onEdit }: { ev: any; onMark: (id: number, s: string, notes?: string) => Promise<void>; onEdit: (ev: any) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [pendingOutcome, setPendingOutcome] = useState<string | null>(null)
  const start = parseAsUTC(ev.start_time)
  const end   = parseAsUTC(ev.end_time)

  return (
    <div className="bg-surface-1 rounded-xl border border-white/[0.07] shadow-sm p-3 space-y-2.5 hover:border-white/10 transition-all">
      <div className="flex items-start gap-2 justify-between">
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onEdit(ev)}>
          <p className="font-semibold text-white/90 text-sm truncate">{ev.title}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {ev.lead_id && (
            <Link to={`/leads/${ev.lead_id}`} className="p-1.5 hover:bg-surface-2 rounded-lg text-white/52 transition-colors" title="Ver lead">
              <Link2 size={12} />
            </Link>
          )}
          <button onClick={() => onEdit(ev)} className="p-1.5 hover:bg-surface-2 rounded-lg text-white/52 transition-colors">
            <MoreVertical size={12} />
          </button>
        </div>
      </div>

      {ev.contact_name && (
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-white/78">
            {ev.contact_name.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs font-semibold text-white/85 truncate">{ev.contact_name}</span>
        </div>
      )}

      {ev.contact_phone && (
        <a href={`tel:${ev.contact_phone}`} className="flex items-center gap-1.5 text-[11px] text-lime hover:text-lime/70 transition-colors">
          <Phone size={11} className="flex-shrink-0" />
          <span className="font-mono">{ev.contact_phone}</span>
        </a>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-white/62">
        <Calendar size={11} className="flex-shrink-0 text-white/52" />
        <span className="font-semibold">{format(start, "d MMM yyyy", { locale: es })}</span>
        <Clock size={10} className="flex-shrink-0 text-white/52 ml-1" />
        <span>{format(start, 'HH:mm')} – {format(end, 'HH:mm')}</span>
      </div>

      {ev.notes && (
        <div className="text-[11px] text-white/52 leading-relaxed">
          {expanded ? (
            <>
              <p className="whitespace-pre-wrap">{ev.notes}</p>
              <button onClick={() => setExpanded(false)} className="text-neon/70 hover:text-neon mt-0.5">menos ▲</button>
            </>
          ) : (
            <button onClick={() => setExpanded(true)} className="flex items-start gap-1 text-left hover:text-white/78 transition-colors">
              <FileText size={10} className="flex-shrink-0 mt-0.5" />
              <span className="line-clamp-2">{ev.notes}</span>
            </button>
          )}
        </div>
      )}

      {ev.creator_name && <p className="text-[10px] text-white/38">Agendado por {ev.creator_name}</p>}

      {ev.vendor_status && OUTCOME_CONFIG[ev.vendor_status] && (
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${OUTCOME_CONFIG[ev.vendor_status].badgeClass}`}>
          {OUTCOME_CONFIG[ev.vendor_status].icon}
          {OUTCOME_CONFIG[ev.vendor_status].label}
        </div>
      )}

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

      {pendingOutcome && (
        <OutcomeModal
          outcome={pendingOutcome}
          onConfirm={async (notes) => { await onMark(ev.id, pendingOutcome, notes || undefined); setPendingOutcome(null) }}
          onCancel={() => setPendingOutcome(null)}
        />
      )}
    </div>
  )
}

/* ─── Historial table ─── */
function HistorialTable({ items }: { items: any[] }) {
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  return (
    <div className="mt-6">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-surface-1 text-sm font-semibold text-white/70 hover:text-white hover:bg-surface-0 transition-all w-full">
        <ChevronDown size={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        <span>Historial (últimas 24h+)</span>
        <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/60">{items.length}</span>
      </button>
      {open && (
        <div className="mt-3 rounded-xl overflow-hidden border border-white/[0.07]">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                {['Fecha','Cliente','Reunión','Resultado','Agendó'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 font-bold text-white/45 uppercase tracking-widest text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((ev, i) => {
                const isExitoso = ev.vendor_status === 'altamente_interesado'
                const isNoShow  = ev.vendor_status === 'no_show'
                return (
                  <tr key={ev.id} style={{ background: i % 2 === 0 ? 'var(--surface-2)' : 'transparent', borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-2.5 text-white/55 whitespace-nowrap">{format(new Date(ev.start_time), "d MMM yyyy HH:mm", { locale: es })}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-bold text-white/70 flex-shrink-0">{ev.contact_name?.charAt(0)?.toUpperCase() ?? '?'}</div>
                        <span className="font-semibold text-white/80 truncate max-w-[120px]">{ev.contact_name ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><span className="text-white/60 truncate max-w-[140px] block">{ev.title}</span></td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isExitoso ? 'bg-lime/15 text-lime' : isNoShow ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger'}`}>
                        {isExitoso ? <ThumbsUp size={9}/> : isNoShow ? <WifiOff size={9}/> : <XCircle size={9}/>}
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

/* ─── Main page ─── */
export default function VendorPipeline() {
  const [pipeline, setPipeline] = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<any>(null)
  const [showModal, setShowModal]         = useState(false)
  const [otLeadId, setOtLeadId]           = useState<number | null>(null)
  const [showReuniones, setShowReuniones] = useState(false)

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

  const totalLeads = PIPELINE_STAGES.reduce((a, s) => a + ((pipeline?.[s] ?? []).length), 0)

  // Pending meeting events (espera_cliente = no outcome yet)
  const pendingEvents: any[] = pipeline?.espera_cliente ?? []
  const sinExitoEvents: any[] = [...(pipeline?.sin_exito ?? []), ...(pipeline?.no_show ?? [])]
  const totalPendingEvents = pendingEvents.length + sinExitoEvents.length
  const sinOTCount = [...(pipeline?.cierre ?? []), ...(pipeline?.pago_comprometido ?? [])].filter((l: any) => !l.has_ot).length

  return (
    <div className="flex flex-col h-full gap-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">Mi Pipeline</h1>
          <p className="text-xs text-white/62 mt-0.5">
            {totalLeads} lead{totalLeads !== 1 ? 's' : ''}
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
        <>
          {/* ── Pipeline stages kanban ── */}
          <div className="flex gap-4 overflow-x-auto pb-2 flex-shrink-0">
            {PIPELINE_STAGES.map(stage => {
              const cfg   = STAGE_CFG[stage]
              const items: any[] = pipeline?.[stage] ?? []
              return (
                <div key={stage} className="flex flex-col flex-shrink-0" style={{ minWidth: 240, width: 240 }}>
                  {/* Column header */}
                  <div className="rounded-xl mb-2.5 px-3 py-2.5 flex items-center justify-between"
                    style={{
                      background: `color-mix(in srgb, ${cfg.accent} 8%, #ffffff)`,
                      border: `2px solid ${cfg.border}`,
                      boxShadow: `0 2px 8px rgba(26,32,53,0.06), 0 0 0 1px ${cfg.border}40`,
                    }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.accent }} />
                      <p className="font-bold text-xs truncate" style={{ color: '#1a2035' }}>{cfg.label}</p>
                    </div>
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: `${cfg.accent}22`, color: cfg.accent }}>
                      {items.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)', minHeight: 50 }}>
                    {items.length === 0 ? (
                      <div className="text-center py-8 text-xs rounded-xl"
                        style={{ color: 'rgba(26,32,53,0.35)', border: '1.5px dashed #e2e8f0' }}>
                        Sin leads
                      </div>
                    ) : items.map((lead: any) => (
                      <LeadCard key={lead.lead_id} lead={lead} onOT={id => setOtLeadId(id)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Reuniones pendientes (collapsible) ── */}
          {totalPendingEvents > 0 && (
            <div className="flex-shrink-0">
              <button
                onClick={() => setShowReuniones(v => !v)}
                className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border border-white/10 bg-surface-1 text-sm font-semibold text-white/80 hover:bg-surface-0 transition-all">
                <ChevronDown size={14} className={`transition-transform duration-200 ${showReuniones ? 'rotate-180' : ''}`} />
                <span>Reuniones pendientes de resultado</span>
                <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-warn/15 text-warn">{totalPendingEvents}</span>
              </button>

              {showReuniones && (
                <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
                  {/* En proceso */}
                  {pendingEvents.length > 0 && (
                    <div className="flex flex-col flex-shrink-0" style={{ minWidth: 260, width: 260 }}>
                      <div className="rounded-xl mb-2.5 px-3 py-2.5 flex items-center justify-between border bg-warn/[0.07] border-warn/20">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-warn" />
                          <p className="font-bold text-xs text-white/90">En proceso de reunión</p>
                        </div>
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-warn/15 text-warn">{pendingEvents.length}</span>
                      </div>
                      <div className="space-y-2.5 overflow-y-auto" style={{ maxHeight: 400 }}>
                        {pendingEvents.map((ev: any) => <EventCard key={ev.id} ev={ev} onMark={handleMark} onEdit={handleEdit} />)}
                      </div>
                    </div>
                  )}

                  {/* Sin éxito / No conectó */}
                  {sinExitoEvents.length > 0 && (
                    <div className="flex flex-col flex-shrink-0" style={{ minWidth: 260, width: 260 }}>
                      <div className="rounded-xl mb-2.5 px-3 py-2.5 flex items-center justify-between border bg-danger/[0.07] border-danger/20">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-danger" />
                          <p className="font-bold text-xs text-white/90">Sin Éxito / No Conectó</p>
                        </div>
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-danger/15 text-danger">{sinExitoEvents.length}</span>
                      </div>
                      <div className="space-y-2.5 overflow-y-auto" style={{ maxHeight: 400 }}>
                        {sinExitoEvents.map((ev: any) => <EventCard key={ev.id} ev={ev} onMark={handleMark} onEdit={handleEdit} />)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <HistorialTable items={pipeline?.historial ?? []} />
        </>
      )}

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
