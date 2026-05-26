import { useState, useEffect, useCallback, useRef } from 'react'
import { getPipelineSummary, getGroups, moveLeadStage, getStageLabels, getPipelineStages, getAgendadoraFollowup } from '../api'
import { apiUrl } from '../api/client'
import type { Lead, Group, PaymentVerification } from '../types'
import { STAGE_LABELS } from '../types'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  RefreshCw, Eye, FileText, AlertTriangle, Lock,
  Loader2, ChevronDown, ChevronRight, X, ArrowRight, Info, Clock,
  WifiOff, XCircle, CalendarPlus, Search, ClipboardList,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/auth'
import VerifyModal from '../components/VerifyModal'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { MoveLeadModal, MAIN_STAGES, RECOVERY_STAGES } from '../components/MoveLeadModal'
import { WorkOrderModal } from '../components/WorkOrderModal'
const COL_LIMIT       = 10

const NEXT_STAGE: Record<string, string> = {
  lead:                 'reunion',
  reunion:              'altamente_interesado',
  altamente_interesado: 'cierre',
  cierre:               'pago_comprometido',
  pago_comprometido:    'pagado_confirmado',
  recuperacion_lead:    'reunion',
  recuperacion_reunion: 'altamente_interesado',
  recuperacion_cierre:  'pago_comprometido',
  recuperacion_pago:    'pago_comprometido',
}

const PREV_STAGE: Record<string, string> = {
  reunion:              'lead',
  altamente_interesado: 'reunion',
  cierre:               'altamente_interesado',
  pago_comprometido:    'cierre',
}

const COL_STYLE: Record<string, { dot: string; accent: string; count: string }> = {
  lead:                 { dot: 'bg-white/25',   accent: 'border-l-white/25',   count: 'bg-surface-2 text-white'  },
  reunion:              { dot: 'bg-white/35',   accent: 'border-l-white/35',   count: 'bg-surface-2 text-white'  },
  altamente_interesado: { dot: 'bg-white/50',   accent: 'border-l-white/50',   count: 'bg-surface-2 text-white'  },
  cierre:               { dot: 'bg-neon',   accent: 'border-l-neon',   count: 'bg-surface-2 text-white'  },
  pago_comprometido:    { dot: 'bg-neon',           accent: 'border-l-neon',   count: 'bg-surface-2 text-white'  },
  pagado_confirmado:    { dot: 'bg-lime',    accent: 'border-l-lime',    count: 'bg-surface-2 text-white'  },
  recuperacion_lead:    { dot: 'bg-danger', accent: 'border-l-danger', count: 'bg-surface-2 text-white'  },
  recuperacion_reunion: { dot: 'bg-danger', accent: 'border-l-danger', count: 'bg-surface-2 text-white'  },
  recuperacion_cierre:  { dot: 'bg-danger', accent: 'border-l-danger', count: 'bg-surface-2 text-white'  },
  recuperacion_pago:    { dot: 'bg-danger', accent: 'border-l-danger', count: 'bg-surface-2 text-white'  },
}

function fmt(n: number) { return `$${Math.round(n).toLocaleString('es-CL')}` }

const CARD_ACCENT: Record<string, { border: string }> = {
  lead:                 { border: '#94a3b8' },
  reunion:              { border: '#f59e0b' },
  altamente_interesado: { border: '#f59e0b' },
  cierre:               { border: '#4361ee' },
  pago_comprometido:    { border: '#22c55e' },
  pagado_confirmado:    { border: '#22c55e' },
  recuperacion_lead:    { border: '#ef4444' },
  recuperacion_reunion: { border: '#ef4444' },
  recuperacion_cierre:  { border: '#ef4444' },
  recuperacion_pago:    { border: '#ef4444' },
}

/* ──────────────────── LeadCard ──────────────────── */
function LeadCard({ lead, canMove, showGroup, labels, canConfirmPago, onMoved, userRole, highlightSinOT }: {
  lead: Lead; canMove: boolean; showGroup: boolean
  labels: Record<string, string>
  canConfirmPago: boolean
  onMoved: (updated: Lead) => void
  userRole?: string
  highlightSinOT?: boolean
}) {
  const [showMoveModal, setShowMoveModal] = useState<{ target: string } | null>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showOTModal, setShowOTModal] = useState(false)
  const navigate = useNavigate()
  const nextStage = NEXT_STAGE[lead.current_stage]
  const prevStage = PREV_STAGE[lead.current_stage]

  const isAgendadora = userRole === 'agendadora'
  // Agendadoras cannot advance a lead that is in 'reunion' — only the vendor can do that
  const blockedAdvance = isAgendadora && lead.current_stage === 'reunion'

  const canShowArrow = canMove && nextStage && (nextStage !== 'pagado_confirmado' || canConfirmPago) && !blockedAdvance
  const canShowBack  = canMove && prevStage

  const isPaid    = lead.current_stage === 'pagado_confirmado'
  const isRec     = lead.current_stage.startsWith('recuperacion')
  const isClosing = lead.current_stage === 'cierre' || lead.current_stage === 'pago_comprometido'
  const isReunion = lead.current_stage === 'reunion'
  const isAlt     = lead.current_stage === 'altamente_interesado'

  // Stage-based color palette
  const palette = isPaid
    ? { bg: 'rgba(163,230,53,0.08)', border: 'rgba(163,230,53,0.32)', accent: '#65a30d', avatarBg: 'rgba(163,230,53,0.18)', avatarColor: '#65a30d', tagBg: 'rgba(163,230,53,0.15)', tagColor: '#65a30d' }
    : isRec
    ? { bg: 'rgba(239,35,60,0.06)',  border: 'rgba(239,35,60,0.28)',  accent: '#ef233c', avatarBg: 'rgba(239,35,60,0.12)', avatarColor: '#ef233c', tagBg: 'rgba(239,35,60,0.10)', tagColor: '#ef233c' }
    : isClosing
    ? { bg: 'rgba(14,165,233,0.06)', border: 'rgba(14,165,233,0.25)', accent: '#0284c7', avatarBg: 'rgba(14,165,233,0.12)', avatarColor: '#0284c7', tagBg: 'rgba(14,165,233,0.10)', tagColor: '#0284c7' }
    : isAlt
    ? { bg: 'rgba(139,92,246,0.06)', border: 'rgba(139,92,246,0.25)', accent: '#7c3aed', avatarBg: 'rgba(139,92,246,0.12)', avatarColor: '#7c3aed', tagBg: 'rgba(139,92,246,0.10)', tagColor: '#7c3aed' }
    : isReunion
    ? { bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.25)', accent: '#2563eb', avatarBg: 'rgba(59,130,246,0.12)', avatarColor: '#2563eb', tagBg: 'rgba(59,130,246,0.10)', tagColor: '#2563eb' }
    : { bg: 'rgba(67,97,238,0.04)', border: 'rgba(67,97,238,0.20)', accent: '#4361ee', avatarBg: 'rgba(67,97,238,0.10)', avatarColor: '#4361ee', tagBg: 'rgba(67,97,238,0.08)', tagColor: '#4361ee' }

  const handleMove = async (stage: string) => {
    try {
      const updated = await moveLeadStage(lead.id, { stage })
      onMoved(updated)
      window.dispatchEvent(new CustomEvent('lead-stage-changed'))
      toast.success(`Movido a ${labels[stage] ?? stage}`)
      setShowMoveModal(null)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error al mover')
    }
  }

  const handleVerClick = (e: React.MouseEvent) => {
    if (lead.current_stage === 'pagado_confirmado' && (lead as any).payment_verification) {
      e.preventDefault()
      setShowViewModal(true)
    }
  }

  const daysIn = lead.created_at
    ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)
    : 0

  const isHot  = daysIn >= 5
  const isWarm = daysIn >= 2 && daysIn < 5

  const priorityColor = lead.priority === 'high' ? '#ff0055' : lead.priority === 'normal' ? '#60a5fa' : 'var(--text-muted)'

  const AVATAR_GRADIENTS = [
    'linear-gradient(135deg, #4361ee 0%, #3a0ca3 100%)',
    'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)',
    'linear-gradient(135deg, #0891b2 0%, #164e63 100%)',
    'linear-gradient(135deg, #059669 0%, #064e3b 100%)',
    'linear-gradient(135deg, #d97706 0%, #92400e 100%)',
    'linear-gradient(135deg, #dc2626 0%, #7f1d1d 100%)',
  ]
  const avatarGrad = AVATAR_GRADIENTS[(lead.contact?.name?.charCodeAt(0) ?? 0) % AVATAR_GRADIENTS.length]

  const ca = lead.last_vendor_outcome === 'no_show'
    ? { border: '#fb8500' }
    : (CARD_ACCENT[lead.current_stage] ?? CARD_ACCENT.lead)

  const needsOT = lead.current_stage === 'cierre' && !lead.has_ot
  const effectiveBorder = needsOT ? '#ef233c' : ca.border

  return (
    <>
      <div className="group rounded-xl overflow-hidden transition-all duration-200"
        style={{
          background: needsOT ? 'rgba(239,35,60,0.06)' : `color-mix(in srgb, ${ca.border} 5%, #ffffff)`,
          border: `2px solid ${effectiveBorder}`,
          boxShadow: needsOT ? '0 0 0 3px rgba(239,35,60,0.18)' : `0 2px 8px rgba(26,32,53,0.06), 0 0 0 1px ${ca.border}40`,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 6px 16px rgba(26,32,53,0.10), 0 0 0 2px ${effectiveBorder}60`; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = needsOT ? '0 0 0 3px rgba(239,35,60,0.18)' : `0 2px 8px rgba(26,32,53,0.06), 0 0 0 1px ${ca.border}40`; (e.currentTarget as HTMLElement).style.transform = 'none' }}>

        {/* ── Top: stage badge + days + priority ── */}
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ background: palette.tagBg, color: palette.tagColor }}>
            {labels[lead.current_stage] ?? lead.current_stage}
          </span>
          <div className="flex items-center gap-1.5">
            {lead.priority === 'high' && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(220,38,38,0.10)', color: '#dc2626' }}>
                ↑ Alta
              </span>
            )}
            {needsOT && (
              <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(239,35,60,0.12)', color: '#ef233c' }}>
                <ClipboardList size={8} /> Sin OT
              </span>
            )}
            <span className="flex items-center gap-0.5 text-[9px] font-semibold"
              style={{ color: isHot ? '#dc2626' : isWarm ? '#d97706' : 'rgba(26,32,53,0.40)' }}>
              <Clock size={8} />
              {daysIn}d
            </span>
          </div>
        </div>

        <div className="px-3 pb-3 space-y-2.5">
          {/* ── Avatar + Name + Arrow ── */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-sm text-white"
              style={{ background: avatarGrad, boxShadow: '0 3px 8px rgba(0,0,0,0.16)' }}>
              {lead.contact?.name?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm leading-tight truncate" style={{ color: '#1a2035' }}>
                {lead.contact?.name ?? '—'}
              </p>
              <p className="text-[10px] truncate mt-0.5 font-medium" style={{ color: 'rgba(26,32,53,0.48)' }}>
                {lead.area?.name ?? '—'}
                {showGroup && lead.group?.name && (
                  <span style={{ color: palette.accent }}> · {lead.group.name}</span>
                )}
              </p>
            </div>
            {canShowArrow ? (
              <button onClick={() => setShowMoveModal({ target: nextStage })}
                title={`→ ${labels[nextStage] || nextStage}`}
                className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                style={{
                  background: nextStage === 'pagado_confirmado' ? 'rgba(163,230,53,0.15)' : 'var(--surface-3)',
                  color: nextStage === 'pagado_confirmado' ? '#a3e635' : 'var(--text-muted)',
                  border: `1px solid ${nextStage === 'pagado_confirmado' ? 'rgba(163,230,53,0.30)' : 'var(--border)'}`,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = nextStage === 'pagado_confirmado' ? 'rgba(163,230,53,0.28)' : 'var(--surface-4)'; (e.currentTarget as HTMLElement).style.color = nextStage === 'pagado_confirmado' ? '#a3e635' : 'var(--text)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = nextStage === 'pagado_confirmado' ? 'rgba(163,230,53,0.15)' : 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = nextStage === 'pagado_confirmado' ? '#a3e635' : 'var(--text-muted)' }}>
                <ChevronRight size={14} />
              </button>
            ) : blockedAdvance ? (
              /* Locked — waiting for vendor result */
              <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                title="Esperando resultado del vendedor"
                style={{ background: 'rgba(255,166,0,0.10)', border: '1px solid rgba(255,166,0,0.25)', color: '#ffa600' }}>
                <Lock size={11} />
              </div>
            ) : (
              <Link to={`/leads/${lead.id}`} onClick={handleVerClick}
                className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                style={{ background: 'var(--surface-3)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-4)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)' }}>
                <Eye size={12} />
              </Link>
            )}
          </div>

          {/* ── Phone ── */}
          {lead.contact?.phone && (
            <p className="text-[10px] font-mono truncate" style={{ color: 'rgba(26,32,53,0.45)' }}>
              {lead.contact.phone}
            </p>
          )}

          {/* ── No se conectó: badge naranja prominente ── */}
          {lead.last_vendor_outcome === 'no_show' && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
              style={{ background: 'rgba(251,133,0,0.10)', border: '1px solid rgba(251,133,0,0.28)' }}>
              <WifiOff size={10} style={{ color: '#fb8500', flexShrink: 0 }} />
              <span className="text-[9px] font-bold" style={{ color: '#fb8500' }}>
                No se conectó — pendiente reagendar
              </span>
            </div>
          )}

          {/* ── Bloqueado: esperando resultado del vendedor ── */}
          {blockedAdvance && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,166,0,0.08)', border: '1px solid rgba(255,166,0,0.20)' }}>
              <Lock size={10} style={{ color: '#ffa600', flexShrink: 0 }} />
              <span className="text-[9px] font-bold" style={{ color: '#ffa600' }}>
                Esperando resultado del vendedor
              </span>
            </div>
          )}

          {/* ── Financiero — siempre visible ── */}
          <div className="pt-2 space-y-1.5 rounded-lg px-2.5 py-2"
            style={{ background: '#f8fafc', border: `1px solid #e2e8f0` }}>

            {/* Honorarios */}
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'rgba(26,32,53,0.42)' }}>
                Honorarios
              </span>
              {lead.honorarios > 0 ? (
                <span className="text-[12px] font-black" style={{ color: palette.accent }}>
                  {fmt(lead.honorarios)}
                </span>
              ) : (
                <span className="text-[9px] italic" style={{ color: 'rgba(26,32,53,0.35)' }}>Sin definir</span>
              )}
            </div>

            {/* Cuotas */}
            {lead.honorarios > 0 && lead.num_cuotas > 1 ? (
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'rgba(26,32,53,0.42)' }}>
                  {lead.num_cuotas} cuotas de
                </span>
                <span className="text-[10px] font-bold" style={{ color: '#1a2035' }}>
                  {fmt(lead.monto_cuota)}
                </span>
              </div>
            ) : lead.honorarios > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'rgba(26,32,53,0.42)' }}>
                  Pago
                </span>
                <span className="text-[9px] font-semibold" style={{ color: 'rgba(26,32,53,0.60)' }}>
                  Único
                </span>
              </div>
            ) : null}

            {/* Cuota inicial distinta */}
            {lead.honorarios > 0 && lead.num_cuotas > 1 && lead.cuota_inicial > 0 && lead.cuota_inicial !== lead.monto_cuota && (
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'rgba(26,32,53,0.42)' }}>
                  Cuota inicial
                </span>
                <span className="text-[10px] font-bold" style={{ color: '#1a2035' }}>
                  {fmt(lead.cuota_inicial)}
                </span>
              </div>
            )}

            {/* Descripción del servicio */}
            {lead.service_description && (
              <p className="text-[9px] leading-relaxed mt-0.5 line-clamp-2"
                style={{ color: 'rgba(26,32,53,0.48)' }}>
                {lead.service_description}
              </p>
            )}

            {/* Fuente */}
            {lead.source && (
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'rgba(26,32,53,0.40)' }}>
                  Fuente
                </span>
                <span className="text-[9px] capitalize font-semibold" style={{ color: 'rgba(26,32,53,0.60)' }}>
                  {lead.source}
                </span>
              </div>
            )}
          </div>

          {/* ── Hover actions ── */}
          <div className="hidden group-hover:flex items-center gap-1 pt-2 mt-1"
            style={{ borderTop: '1px solid #e2e8f0' }}>
            <button onClick={() => navigate('/leads', { state: { openLeadId: lead.id } })}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
              style={{ background: '#f8fafc', color: 'rgba(26,32,53,0.60)', border: '1px solid #e2e8f0' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = palette.tagBg; (e.currentTarget as HTMLElement).style.color = palette.tagColor }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; (e.currentTarget as HTMLElement).style.color = 'rgba(26,32,53,0.60)' }}>
              <Eye size={11} /> Ver
            </button>
            <button onClick={() => setShowOTModal(true)}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
              style={{ background: '#f8fafc', color: 'rgba(26,32,53,0.60)', border: '1px solid #e2e8f0' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#edf2f7'; (e.currentTarget as HTMLElement).style.color = '#1a2035' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; (e.currentTarget as HTMLElement).style.color = 'rgba(26,32,53,0.60)' }}>
              <ClipboardList size={11} /> OT
            </button>
            {canShowBack && (
              <button onClick={() => setShowMoveModal({ target: prevStage })}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
                style={{ background: '#f8fafc', color: 'rgba(26,32,53,0.55)', border: '1px solid #e2e8f0' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#edf2f7'; (e.currentTarget as HTMLElement).style.color = '#1a2035' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; (e.currentTarget as HTMLElement).style.color = 'rgba(26,32,53,0.55)' }}>
                <ChevronDown size={11} className="rotate-90" /> Retro
              </button>
            )}
          </div>
        </div>
      </div>

      {showMoveModal && (
        <MoveLeadModal
          lead={lead}
          targetStage={showMoveModal.target}
          labels={labels}
          canConfirmPago={canConfirmPago}
          userRole={userRole}
          onConfirm={handleMove}
          onClose={() => setShowMoveModal(null)}
        />
      )}

      {showOTModal && (
        <WorkOrderModal
          leadId={lead.id}
          honorarios={lead.honorarios}
          onClose={() => setShowOTModal(false)}
          onSaved={() => setShowOTModal(false)}
        />
      )}

      {showViewModal && (lead as any).payment_verification && (
        <VerifyModal
          pv={(lead as any).payment_verification}
          type="view"
          form={{}}
          setForm={() => {}}
          onConfirm={() => {}}
          onClose={() => setShowViewModal(false)}
        />
      )}
    </>
  )
}

/* ──────────────────── Column ──────────────────── */
function Column({ stage, leads, stageCount, canMove, showGroup, labels, canConfirmPago, onMoved, userRole, highlightSinOT }: {
  stage: string; leads: Lead[]; stageCount: number
  canMove: boolean
  showGroup: boolean
  labels: Record<string, string>
  canConfirmPago: boolean
  onMoved: (updated: Lead) => void
  userRole?: string
  highlightSinOT?: boolean
}) {
  const style    = COL_STYLE[stage] ?? COL_STYLE.lead
  const totalHon = leads.reduce((a, l) => a + l.honorarios, 0)
  const hidden   = stageCount - leads.length
  const isLocked = stage === 'pagado_confirmado' && !canConfirmPago

  const isPaid  = stage === 'pagado_confirmado'
  const isRec   = stage.startsWith('recuperacion')
  const isClose = stage === 'cierre' || stage === 'pago_comprometido'
  const isAlt   = stage === 'altamente_interesado'
  const isReu   = stage === 'reunion'

  // Same palette as LeadCard — header matches card colors
  const colPalette = isPaid
    ? { bg: 'rgba(163,230,53,0.08)',  border: 'rgba(163,230,53,0.28)',  accent: '#65a30d',  countBg: 'rgba(163,230,53,0.18)', countColor: '#65a30d', honColor: '#65a30d', dotClass: 'bg-lime-600' }
    : isRec
    ? { bg: 'rgba(239,35,60,0.06)',   border: 'rgba(239,35,60,0.25)',   accent: '#ef233c',  countBg: 'rgba(239,35,60,0.12)', countColor: '#ef233c', honColor: '#ef233c', dotClass: 'bg-danger' }
    : isClose
    ? { bg: 'rgba(14,165,233,0.06)',  border: 'rgba(14,165,233,0.22)',  accent: '#0284c7',  countBg: 'rgba(14,165,233,0.12)', countColor: '#0284c7', honColor: '#0284c7', dotClass: 'bg-sky-500' }
    : isAlt
    ? { bg: 'rgba(139,92,246,0.06)',  border: 'rgba(139,92,246,0.22)',  accent: '#7c3aed',  countBg: 'rgba(139,92,246,0.12)', countColor: '#7c3aed', honColor: '#7c3aed', dotClass: 'bg-violet-600' }
    : isReu
    ? { bg: 'rgba(59,130,246,0.06)',  border: 'rgba(59,130,246,0.22)',  accent: '#2563eb',  countBg: 'rgba(59,130,246,0.12)', countColor: '#2563eb', honColor: '#2563eb', dotClass: 'bg-blue-500' }
    : { bg: 'rgba(67,97,238,0.04)',   border: 'rgba(67,97,238,0.20)',   accent: '#4361ee',  countBg: 'rgba(67,97,238,0.12)', countColor: '#4361ee', honColor: '#4361ee', dotClass: 'bg-[#4361ee]' }

  const colAccent = CARD_ACCENT[stage] ?? CARD_ACCENT.lead

  return (
    <div className="flex flex-col flex-shrink-0" style={{ minWidth: 240, width: 240 }}>
      {/* ── Column header ── */}
      <div className="rounded-xl mb-2.5 px-3 py-2.5 flex items-center justify-between"
        style={{
          background: `color-mix(in srgb, ${colAccent.border} 8%, #ffffff)`,
          border: `2px solid ${colAccent.border}`,
          boxShadow: `0 2px 8px rgba(26,32,53,0.06), 0 0 0 1px ${colAccent.border}40`,
        }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colAccent.border }} />
          <div className="min-w-0">
            <p className="font-bold text-xs leading-tight truncate" style={{ color: '#1a2035' }}>
              {labels[stage] ?? stage}
              {isLocked && <Lock size={10} className="inline ml-1 opacity-40" />}
            </p>
            {totalHon > 0 && (
              <p className="text-[10px] mt-0.5 font-bold" style={{ color: colAccent.border }}>
                ${fmt(totalHon)}
              </p>
            )}
          </div>
        </div>
        <span className="text-[11px] font-bold min-w-[22px] h-5 rounded-full flex items-center justify-center px-1.5"
          style={{ background: colPalette.countBg, color: colPalette.countColor }}>
          {stageCount}
        </span>
      </div>

      {/* ── Cards ── */}
      <div className="space-y-2 overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 270px)', minHeight: 50 }}>

        {stageCount === 0 && (
          <div className="text-center py-8 text-xs rounded-xl"
            style={{ color: 'rgba(26,32,53,0.35)', border: '1.5px dashed #e2e8f0' }}>
            Sin leads
          </div>
        )}

        {leads.map(l => (
          <LeadCard key={l.id} lead={l} canMove={canMove} showGroup={showGroup} labels={labels} canConfirmPago={canConfirmPago} onMoved={onMoved} userRole={userRole} highlightSinOT={highlightSinOT} />
        ))}

        {hidden > 0 && (
          <Link to={`/leads?stage=${stage}`}
            className="flex flex-col items-center justify-center py-3 rounded-xl transition-all group"
            style={{ background: 'var(--surface-2)', border: '1px dashed var(--border)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}>
            <p className="text-xs font-bold" style={{ color: 'var(--text-2)' }}>+{hidden} leads más</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Ver todos →</p>
          </Link>
        )}
      </div>
    </div>
  )
}

/* ──────────────────── SeguimientoTab ──────────────────── */
function SeguimientoTab({ items }: { items: any[] }) {
  const navigate                = useNavigate()
  const [sub, setSub]           = useState<'all' | 'no_show' | 'sin_exito'>('all')
  const [search, setSearch]     = useState('')

  const filtered = items.filter(item => {
    if (sub !== 'all' && item.vendor_status !== sub) return false
    if (search) {
      const q = search.toLowerCase()
      if (!item.contact_name?.toLowerCase().includes(q) && !item.vendor_name?.toLowerCase().includes(q) && !item.outcome_note?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const countNo  = items.filter(i => i.vendor_status === 'no_show').length
  const countSin = items.filter(i => i.vendor_status === 'sin_exito').length

  return (
    <div className="space-y-4 flex-1 overflow-y-auto pb-4">
      {/* Sub-filtros + búsqueda */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-xl p-1"
          style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
          {([['all','Todos',items.length],['no_show','No se conectó',countNo],['sin_exito','No cerró',countSin]] as ['all'|'no_show'|'sin_exito', string, number][]).map(([val, label, count]) => (
            <button key={val} onClick={() => setSub(val)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
              style={sub === val
                ? { background: 'var(--surface-1)', color: 'var(--primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }
                : { color: 'var(--text-3)' }}>
              {label}
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  background: sub === val ? 'var(--primary-dim)' : 'var(--surface-4)',
                  color: sub === val ? 'var(--primary)' : 'var(--text-muted)',
                }}>{count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[200px] rounded-xl px-3 py-2"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-2)' }}>
          <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente, vendedor, nota..."
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: 'var(--text)' }} />
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center rounded-2xl"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <CalendarPlus size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-3)' }}>
            {search || sub !== 'all' ? 'Sin resultados para este filtro' : 'Sin reuniones pendientes de reagendar'}
          </p>
          {(!search && sub === 'all') && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Las reuniones marcadas como fallidas por los vendedores aparecen aquí</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((item: any) => {
            const isNoShow   = item.vendor_status === 'no_show'
            const statusClr  = isNoShow ? 'var(--warn)'   : 'var(--danger)'
            const statusDim  = isNoShow ? 'rgba(251,133,0,0.10)' : 'rgba(239,35,60,0.10)'
            const statusBrd  = isNoShow ? 'rgba(251,133,0,0.22)' : 'rgba(239,35,60,0.22)'
            const statusLabel = isNoShow ? 'No se conectó' : 'Se conectó y no cerró'
            const StatusIcon  = isNoShow ? WifiOff : XCircle
            return (
              <div key={item.id} className="rounded-2xl p-4 space-y-3 transition-all"
                style={{ background: 'var(--surface-1)', border: `2px solid ${statusBrd}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>

                {/* Top */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: statusDim, color: statusClr, border: `1px solid ${statusBrd}` }}>
                      <StatusIcon size={12} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate" style={{ color: 'var(--text)' }}>{item.contact_name ?? '—'}</p>
                      <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.title}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0"
                    style={{ background: statusDim, color: statusClr, border: `1px solid ${statusBrd}` }}>
                    {statusLabel}
                  </span>
                </div>

                {/* Detalles */}
                <div className="space-y-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                  <div className="flex items-center gap-2">
                    <span className="w-16 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Vendedor</span>
                    <span className="font-semibold" style={{ color: 'var(--text-2)' }}>{item.vendor_name ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-16 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Reunión</span>
                    <span>{format(new Date(item.start_time), "d 'de' MMMM yyyy · HH:mm", { locale: es })}</span>
                  </div>
                  {item.lead_stage && (
                    <div className="flex items-center gap-2">
                      <span className="w-16 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Estado</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ background: 'var(--surface-3)', color: 'var(--text-3)' }}>{item.lead_stage}</span>
                    </div>
                  )}
                </div>

                {/* Nota del vendedor */}
                {item.outcome_note && (
                  <div className="rounded-xl px-3 py-2.5"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Nota del vendedor</p>
                    <p className="text-[12px] leading-relaxed italic" style={{ color: 'var(--text-2)' }}>"{item.outcome_note}"</p>
                  </div>
                )}

                {/* Reagendar */}
                <button
                  onClick={() => navigate('/leads', { state: { openLeadId: item.lead_id } })}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[12px] font-bold transition-all"
                  style={{ background: 'var(--primary-dim)', color: 'var(--primary)', border: '1px solid rgba(67,97,238,0.20)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--primary)'; (e.currentTarget as HTMLElement).style.color = '#fff' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--primary-dim)'; (e.currentTarget as HTMLElement).style.color = 'var(--primary)' }}>
                  <CalendarPlus size={13} /> Reagendar
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ──────────────────── Pipeline (main page) ──────────────────── */
export default function Pipeline() {
  const { user } = useAuthStore()
  const location = useLocation()
  const highlightSinOT = new URLSearchParams(location.search).get('sin_ot') === '1'
  const [summary, setSummary]         = useState<Record<string, { count: number; leads: Lead[] }>>({})
  const [groups, setGroups]           = useState<Group[]>([])
  const [labels, setLabels]           = useState<Record<string, string>>({})
  const [customStages, setCustomStages] = useState<{ key: string; name: string; color?: string }[]>([])
  const [negocioTipo, setNegocioTipo] = useState<string>('abogados')
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState<'main' | 'recovery' | 'seguimiento'>('main')
  const [groupFilter, setGroupFilter] = useState<string>('')
  const [followupItems, setFollowupItems] = useState<any[]>([])

  const isAdmin        = user?.role === 'superadmin' || user?.role === 'subadmin'
  const isAgendadora   = user?.role === 'agendadora'
  const canConfirmPago = user?.role === 'verificador'
  const canMoveAny     = user?.role !== 'verificador'

  const isAbogados = negocioTipo === 'abogados'
  const stages = isAbogados
    ? (filter === 'main' ? MAIN_STAGES : RECOVERY_STAGES)
    : customStages.map(s => s.key)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (groupFilter) params.group_id = parseInt(groupFilter)

      if (isAdmin) {
        const [summaryData, labelsData, groupsData, customStagesData, followupData] = await Promise.all([
          getPipelineSummary(params),
          getStageLabels(),
          getGroups(),
          getPipelineStages().catch(() => []),
          getAgendadoraFollowup().catch(() => []),
        ])
        setSummary(summaryData)
        setLabels(labelsData)
        setGroups(groupsData)
        setCustomStages(customStagesData)
        setFollowupItems(followupData)
        const myGroup = groupsData.find((g: Group) => g.id === user?.group_id)
        setNegocioTipo((myGroup as any)?.tipo ?? 'abogados')
      } else {
        const [summaryData, labelsData, customStagesData, followupData] = await Promise.all([
          getPipelineSummary(params),
          getStageLabels(),
          getPipelineStages().catch(() => []),
          getAgendadoraFollowup().catch(() => []),
        ])
        setSummary(summaryData)
        setLabels(labelsData)
        setCustomStages(customStagesData)
        setFollowupItems(followupData)
      }
    } catch { toast.error('Error cargando pipeline') }
    finally { setLoading(false) }
  }, [isAdmin, groupFilter, user?.group_id])

  useEffect(() => { load() }, [load])

  // SSE — auto-refresh pipeline when AT Informa sends a result
  const sseRef          = useRef<EventSource | null>(null)
  const sseReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadRef         = useRef(load)
  useEffect(() => { loadRef.current = load }, [load])

  useEffect(() => {
    const connect = () => {
      const token = localStorage.getItem('token')
      if (!token) return
      if (sseRef.current) sseRef.current.close()
      const es = new EventSource(apiUrl(`/api/whatsapp/stream?token=${encodeURIComponent(token)}`))
      sseRef.current = es
      es.onmessage = (e) => {
        let evt: any
        try { evt = JSON.parse(e.data) } catch { return }
        if (evt.type === 'pipeline_refresh') loadRef.current()
      }
      es.onerror = () => {
        es.close()
        sseRef.current = null
        sseReconnectRef.current = setTimeout(connect, 3000)
      }
    }
    connect()
    return () => {
      sseRef.current?.close()
      sseRef.current = null
      if (sseReconnectRef.current) clearTimeout(sseReconnectRef.current)
    }
  }, [])

  const handleMoved = (updated: Lead) => {
    setSummary(prev => {
      const next = { ...prev }
      for (const stage of Object.keys(next)) {
        const idx = next[stage].leads.findIndex(l => l.id === updated.id)
        if (idx !== -1) {
          if (updated.current_stage === stage) {
            // Updated in same stage — replace
            next[stage] = { ...next[stage], leads: next[stage].leads.map(l => l.id === updated.id ? updated : l) }
          } else {
            // Moved out — remove from old stage
            next[stage] = { count: next[stage].count - 1, leads: next[stage].leads.filter(l => l.id !== updated.id) }
            // Add to new stage if loaded
            if (next[updated.current_stage]) {
              next[updated.current_stage] = {
                count: next[updated.current_stage].count + 1,
                leads: [updated, ...next[updated.current_stage].leads].slice(0, COL_LIMIT),
              }
            }
          }
          break
        }
      }
      return next
    })
  }

  const recoveryCount = isAbogados ? RECOVERY_STAGES.reduce((a, s) => a + (summary[s]?.count ?? 0), 0) : 0
  const totalLeads    = stages.reduce((a, s) => a + (summary[s]?.count ?? 0), 0)
  const showGroupBadge = isAdmin && !groupFilter

  // Merge custom stage names into labels map for non-abogados
  const effectiveLabels = isAbogados
    ? labels
    : { ...labels, ...Object.fromEntries(customStages.map(s => [s.key, s.name])) }

  return (
    <div className="flex flex-col h-full gap-4">

      {/* Descripción */}
      <div className="hidden sm:flex items-start gap-3 rounded-xl px-4 py-3 text-xs flex-shrink-0" style={{ background: 'rgba(67,97,238,0.07)', border: '1px solid rgba(67,97,238,0.16)', color: 'rgba(52,81,199,0.90)' }}>
        <Info size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'rgba(67,97,238,0.9)' }} />
        <p>El Pipeline muestra el avance de cada caso desde que llega como Lead hasta que el cliente paga. Puede ver en qué etapa está cada expediente, moverlos de etapa y revisar el detalle de cada uno. Use <strong>Recuperación</strong> para ver los casos que necesitan atención urgente.</p>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white">Pipeline</h1>
            {isAdmin && (
              <span className={`text-sm font-bold px-3 py-1 rounded-xl border-2 ${
                groupFilter
                  ? 'bg-surface-1 text-white border-lime'
                  : 'text-warn bg-warn/10 border-amber-300'
              }`}>
                {groupFilter
                  ? groups.find(g => g.id === parseInt(groupFilter))?.name ?? 'Grupo'
                  : '⚠ Todos los grupos'}
              </span>
            )}
          </div>
          <p className="text-white/62 text-sm mt-0.5">
            {loading ? 'Cargando…' : `${totalLeads} expediente${totalLeads !== 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && groups.length > 0 && (
            <div className="relative">
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/52 pointer-events-none" />
              <select
                value={groupFilter}
                onChange={e => setGroupFilter(e.target.value)}
                className="appearance-none h-10 pl-3 pr-8 rounded-xl border border-white/10 bg-surface-1 text-sm font-medium text-white/85 focus:outline-none focus:ring-2 focus:ring-white/15/15 cursor-pointer"
              >
                <option value="">Todos los grupos</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}

          {isAbogados && recoveryCount > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-warn bg-warn/10 border border-warn/25 px-4 py-2 rounded-xl font-semibold">
              <AlertTriangle size={15} /> {recoveryCount} en recuperación
            </span>
          )}

          {isAbogados && (
            <div className="flex bg-surface-2 rounded-xl p-1 overflow-x-auto">
              <button onClick={() => setFilter('main')}
                className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 whitespace-nowrap ${filter === 'main' ? 'bg-surface-1 text-white shadow-sm' : 'text-white/62 hover:text-white/85'}`}>
                Embudo Principal
              </button>
              <button onClick={() => setFilter('recovery')}
                className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 flex items-center gap-1.5 whitespace-nowrap ${filter === 'recovery' ? 'bg-danger text-white shadow-sm' : 'text-danger hover:text-danger/70'}`}>
                {filter !== 'recovery' && <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />}
                Recuperación
              </button>
              <button onClick={() => setFilter('seguimiento')}
                className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 flex items-center gap-1.5 whitespace-nowrap ${filter === 'seguimiento' ? 'shadow-sm' : 'hover:opacity-80'}`}
                style={filter === 'seguimiento' ? { background: 'var(--warn)', color: '#ffffff' } : { color: 'var(--warn)' }}>
                {filter !== 'seguimiento' && followupItems.length > 0 && <span className="w-2 h-2 rounded-full bg-warn animate-pulse" />}
                Seguimiento
                {followupItems.length > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${filter === 'seguimiento' ? 'bg-black/20 text-black' : 'bg-warn/20 text-warn'}`}>{followupItems.length}</span>
                )}
              </button>
            </div>
          )}

          <button onClick={load}
            className="w-10 h-10 flex items-center justify-center border border-white/10 rounded-xl bg-surface-1 text-white/62 hover:bg-surface-0 transition-colors flex-shrink-0">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
        </div>
      ) : filter === 'seguimiento' ? (
        <SeguimientoTab items={followupItems} />
      ) : (
        <div className="flex gap-5 overflow-x-auto pb-4 flex-1">
          {highlightSinOT && (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold shadow-lg"
              style={{ background: '#ef233c', color: '#fff' }}>
              <ClipboardList size={15} />
              Leads en Cierre sin OT marcados en rojo
            </div>
          )}
          {stages.map(s => (
            <Column
              key={s}
              stage={s}
              leads={summary[s]?.leads ?? []}
              stageCount={summary[s]?.count ?? 0}
              canMove={canMoveAny}
              canConfirmPago={canConfirmPago}
              showGroup={showGroupBadge}
              labels={effectiveLabels}
              onMoved={handleMoved}
              userRole={user?.role}
              highlightSinOT={highlightSinOT}
            />
          ))}
        </div>
      )}
    </div>
  )
}
