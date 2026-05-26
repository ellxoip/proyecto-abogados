import { useState } from 'react'
import { ArrowRight, X, Lock, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Lead } from '../types'

export const MAIN_STAGES     = ['lead', 'reunion', 'altamente_interesado', 'cierre', 'pago_comprometido', 'pagado_confirmado']
export const RECOVERY_STAGES = ['recuperacion_lead', 'recuperacion_reunion', 'recuperacion_cierre', 'recuperacion_pago']

export const NEXT_STAGE: Record<string, string> = {
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

export const PREV_STAGE: Record<string, string> = {
  reunion:              'lead',
  altamente_interesado: 'reunion',
  cierre:               'altamente_interesado',
  pago_comprometido:    'cierre',
}

export function MoveLeadModal({ lead, targetStage, labels, onConfirm, onClose, canConfirmPago, userRole }: {
  lead: Lead
  targetStage: string
  labels: Record<string, string>
  onConfirm: (stage: string) => Promise<void>
  onClose: () => void
  canConfirmPago: boolean
  userRole?: string
}) {
  const [confirmText, setConfirmText] = useState('')
  const [moving, setMoving] = useState(false)

  const isAgendadora = userRole === 'agendadora'
  const blockedAdvanceFromReunion = isAgendadora && lead.current_stage === 'reunion'
  const blockedPagoSinOT = isAgendadora && !lead.has_ot

  // Solo etapas válidas según flujo: siguiente, anterior, o recuperación
  const cur = lead.current_stage
  const validSet = new Set<string>([
    ...(NEXT_STAGE[cur] ? [NEXT_STAGE[cur]] : []),
    ...(PREV_STAGE[cur] ? [PREV_STAGE[cur]] : []),
    ...RECOVERY_STAGES,
  ])

  const availableStages = [...MAIN_STAGES, ...RECOVERY_STAGES].filter(s => {
    if (!validSet.has(s)) return false
    if (s === cur) return false
    if (s === 'pagado_confirmado' && !canConfirmPago) return false
    if (blockedAdvanceFromReunion) {
      const allowedFromReunion = ['lead', 'recuperacion_lead', 'recuperacion_reunion', 'recuperacion_cierre', 'recuperacion_pago']
      return allowedFromReunion.includes(s)
    }
    return true
  })

  const defaultStage = targetStage && availableStages.includes(targetStage)
    ? targetStage
    : (NEXT_STAGE[cur] && availableStages.includes(NEXT_STAGE[cur]) ? NEXT_STAGE[cur] : availableStages[0] ?? '')
  const [selectedStage, setSelectedStage] = useState(defaultStage)

  const handleConfirm = async () => {
    if (confirmText.trim().toLowerCase() !== 'confirmar') {
      toast.error('Debes escribir "confirmar" para continuar')
      return
    }
    setMoving(true)
    try {
      await onConfirm(selectedStage)
    } finally {
      setMoving(false)
    }
  }

  const stageDot = (s: string) =>
    s === 'pagado_confirmado' ? 'bg-lime-500' :
    s.startsWith('recuperacion') ? 'bg-red-500' :
    s === 'pago_comprometido' ? 'bg-cyan-500' :
    s === 'cierre' ? 'bg-cyan-400' :
    s === 'altamente_interesado' ? 'bg-violet-500' :
    s === 'reunion' ? 'bg-blue-400' : 'bg-slate-400'

  const isReady = confirmText.trim().toLowerCase() === 'confirmar'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>

        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--primary-dim)', border: '1px solid rgba(67,97,238,0.25)' }}>
              <ArrowRight size={15} style={{ color: 'var(--primary)' }} />
            </div>
            <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>Mover Lead</h3>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm"
              style={{ background: 'var(--primary-dim)', color: 'var(--primary)' }}>
              {lead.contact?.name?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate" style={{ color: 'var(--text)' }}>{lead.contact?.name ?? '—'}</p>
              <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {lead.area?.name} · {labels[lead.current_stage] ?? lead.current_stage}
              </p>
            </div>
          </div>

          {blockedAdvanceFromReunion && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
              style={{ background: 'var(--warn-dim)', border: '1px solid rgba(251,133,0,0.25)' }}>
              <Lock size={13} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p className="text-xs font-bold" style={{ color: 'var(--warn)' }}>Avance bloqueado — en Reunión</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(251,133,0,0.80)' }}>
                  Solo el vendedor puede avanzar este lead. Puedes retrocederlo o enviarlo a recuperación.
                </p>
              </div>
            </div>
          )}

          {blockedPagoSinOT && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
              style={{ background: 'rgba(239,35,60,0.06)', border: '1px solid rgba(239,35,60,0.22)' }}>
              <Lock size={13} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p className="text-xs font-bold" style={{ color: 'var(--danger)' }}>OT pendiente — Pago Comprometido bloqueado</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(239,35,60,0.75)' }}>
                  El vendedor debe crear la Orden de Trabajo antes de mover este lead.
                </p>
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2.5" style={{ color: 'var(--text-muted)' }}>
              Mover a etapa
            </p>
            <div className="grid grid-cols-2 gap-2">
              {availableStages.map(s => {
                const active    = selectedStage === s
                const isRec     = s.startsWith('recuperacion')
                const isBlocked = s === 'pago_comprometido' && blockedPagoSinOT
                return (
                  <button key={s}
                    onClick={() => !isBlocked && setSelectedStage(s)}
                    disabled={isBlocked}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-semibold transition-all"
                    style={{
                      background: isBlocked ? 'rgba(239,35,60,0.04)' : active ? (isRec ? 'rgba(239,35,60,0.07)' : 'rgba(67,97,238,0.08)') : '#f8fafc',
                      border: isBlocked ? '1.5px solid rgba(239,35,60,0.25)' : active ? (isRec ? '1.5px solid rgba(239,35,60,0.35)' : '1.5px solid rgba(67,97,238,0.40)') : '1.5px solid #e2e8f0',
                      color: isBlocked ? '#dc2626' : active ? (isRec ? '#dc2626' : '#4361ee') : '#374151',
                      opacity: isBlocked ? 0.65 : 1,
                      cursor: isBlocked ? 'not-allowed' : 'pointer',
                      fontWeight: active ? 700 : 600,
                    }}>
                    {isBlocked
                      ? <Lock size={9} className="flex-shrink-0" />
                      : <span className={`w-2 h-2 rounded-full flex-shrink-0 ${stageDot(s)}`} />}
                    {labels[s] ?? s}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
              Escribe <span style={{ color: 'var(--primary)' }}>"confirmar"</span> para continuar
            </p>
            <input
              autoFocus
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConfirm()}
              placeholder="confirmar"
              className="w-full rounded-xl px-4 py-3 text-sm font-medium outline-none transition-all"
              style={{
                background: '#f8fafc',
                border: isReady ? '2px solid #4361ee' : '1.5px solid #d1d5db',
                color: isReady ? '#4361ee' : '#1a2035',
                boxShadow: isReady ? '0 0 0 3px rgba(67,97,238,0.10)' : 'none',
                fontWeight: 600,
              }}
            />
          </div>

          {selectedStage && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: '#f0f4ff', border: '1.5px solid rgba(67,97,238,0.18)' }}>
              <span className="text-xs font-semibold" style={{ color: '#6b7280' }}>
                {labels[lead.current_stage] ?? lead.current_stage}
              </span>
              <ArrowRight size={13} style={{ color: '#4361ee', flexShrink: 0 }} />
              <span className="text-xs font-bold" style={{ color: '#4361ee' }}>{labels[selectedStage] ?? selectedStage}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 flex gap-3"
          style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}>
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={moving || !isReady}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-30"
            style={{
              background: isReady ? 'var(--primary)' : 'var(--primary-dim)',
              color: isReady ? '#ffffff' : 'var(--primary)',
              boxShadow: isReady ? '0 4px 20px rgba(67,97,238,0.30)' : 'none',
            }}>
            {moving ? <><Loader2 size={14} className="animate-spin" /> Moviendo...</> : 'Mover Lead'}
          </button>
        </div>
      </div>
    </div>
  )
}
