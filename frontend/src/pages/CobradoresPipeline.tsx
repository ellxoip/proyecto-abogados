import { useState, useEffect } from 'react'
import { X, Phone, Mail, ArrowRight, ChevronRight, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { getCobradorLeads, updateCobradorStage, updateCobradorNotes, updateCobradorMontoPagado } from '../api'

interface CobradorLead {
  id: number
  cobrador_id: number
  contact_id: number | null
  nombre: string
  rut?: string | null
  empresa?: string | null
  telefono?: string | null
  email?: string | null
  monto_deuda: number
  monto_pagado: number
  num_cuotas?: number | null
  cuota_inicial?: number | null
  monto_cuota?: number | null
  descripcion?: string | null
  stage: string
  notes?: string | null
  created_at?: string
}

const STAGES = [
  {
    key: 'lead_moroso',
    label: 'Lead Moroso',
    sublabel: 'Pendiente de contacto',
    color: '#EF4444',
    light: 'rgba(239,68,68,0.10)',
    border: 'rgba(239,68,68,0.20)',
    headerBg: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
    icon: '🔴',
  },
  {
    key: 'pago_comprometido',
    label: 'Pago Comprometido',
    sublabel: 'Acuerdo en negociación',
    color: '#F59E0B',
    light: 'rgba(245,158,11,0.10)',
    border: 'rgba(245,158,11,0.20)',
    headerBg: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    icon: '🟡',
  },
  {
    key: 'pagado',
    label: 'Pagado',
    sublabel: 'Deuda saldada',
    color: '#10B981',
    light: 'rgba(16,185,129,0.10)',
    border: 'rgba(16,185,129,0.20)',
    headerBg: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    icon: '🟢',
  },
]

function fmt(n: number) {
  return `$${Math.round(n).toLocaleString('es-CL')}`
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function PctRing({ pct, color, size = 36 }: { pct: number; color: string; size?: number }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={3} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2 + 3.5} textAnchor="middle" fontSize={8} fontWeight={700} fill={color}>
        {pct.toFixed(0)}%
      </text>
    </svg>
  )
}

function LeadCard({ lead, onSelect }: { lead: CobradorLead; onSelect: (l: CobradorLead) => void }) {
  const stage = STAGES.find(s => s.key === lead.stage)!
  const pct = lead.monto_deuda > 0 ? Math.min((lead.monto_pagado / lead.monto_deuda) * 100, 100) : 0
  const pendiente = Math.max(lead.monto_deuda - lead.monto_pagado, 0)

  return (
    <button
      onClick={() => onSelect(lead)}
      className="w-full text-left group"
      style={{ display: 'block' }}
    >
      <div
        className="rounded-xl p-3.5 transition-all duration-150"
        style={{
          background: '#ffffff',
          border: `1px solid ${stage.border}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(0,0,0,0.10)'
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
          ;(e.currentTarget as HTMLElement).style.borderColor = stage.color
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'
          ;(e.currentTarget as HTMLElement).style.transform = 'none'
          ;(e.currentTarget as HTMLElement).style.borderColor = stage.border
        }}
      >
        {/* Top row: avatar + name + ring */}
        <div className="flex items-start gap-2.5 mb-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-black text-white"
            style={{ background: stage.headerBg }}
          >
            {initials(lead.nombre)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm leading-tight truncate" style={{ color: 'var(--text)' }}>
              {lead.nombre}
            </p>
            {lead.empresa ? (
              <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {lead.empresa}
              </p>
            ) : lead.rut ? (
              <p className="text-[11px] truncate mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>
                {lead.rut}
              </p>
            ) : null}
          </div>
          <PctRing pct={pct} color={stage.color} />
        </div>

        {/* Montos */}
        <div className="rounded-lg p-2.5 mb-2.5" style={{ background: stage.light }}>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: stage.color }}>
                Deuda total
              </p>
              <p className="text-sm font-black" style={{ color: 'var(--text)' }}>
                {fmt(lead.monto_deuda)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>
                Pendiente
              </p>
              <p className="text-sm font-bold" style={{ color: pendiente > 0 ? '#EF4444' : '#10B981' }}>
                {fmt(pendiente)}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.10)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: stage.color }}
            />
          </div>
        </div>

        {/* Footer: contact info + arrow */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {lead.telefono && (
              <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <Phone size={9} /> {lead.telefono}
              </span>
            )}
          </div>
          <ChevronRight size={12} style={{ color: stage.color, opacity: 0.7 }} />
        </div>
      </div>
    </button>
  )
}

function KanbanColumn({
  stage,
  leads,
  onSelect,
}: {
  stage: typeof STAGES[0]
  leads: CobradorLead[]
  onSelect: (l: CobradorLead) => void
}) {
  const totalDeuda = leads.reduce((a, l) => a + l.monto_deuda, 0)
  const totalCobrado = leads.reduce((a, l) => a + l.monto_pagado, 0)

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden flex-shrink-0"
      style={{ width: 288, height: '100%', border: `1px solid ${stage.border}` }}
    >
      {/* Column header */}
      <div className="flex-shrink-0" style={{ background: stage.headerBg }}>
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-black text-white tracking-tight">{stage.label}</span>
            <span
              className="text-xs font-black px-2.5 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.25)', color: 'white' }}
            >
              {leads.length}
            </span>
          </div>
          <p className="text-[10px] text-white/70 font-medium">{stage.sublabel}</p>
        </div>
        {/* Amount strip */}
        {totalDeuda > 0 && (
          <div
            className="px-4 py-2 flex items-center justify-between"
            style={{ background: 'rgba(0,0,0,0.15)' }}
          >
            <div>
              <p className="text-[9px] text-white/60 font-bold uppercase tracking-wider">Total cartera</p>
              <p className="text-xs font-black text-white">{fmt(totalDeuda)}</p>
            </div>
            {totalCobrado > 0 && (
              <div className="text-right">
                <p className="text-[9px] text-white/60 font-bold uppercase tracking-wider">Cobrado</p>
                <p className="text-xs font-black text-white/90">{fmt(totalCobrado)}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cards area */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-2.5"
        style={{ background: stage.light, minHeight: 0 }}
      >
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <div className="text-2xl opacity-40">{stage.icon}</div>
            <p className="text-xs font-medium" style={{ color: stage.color, opacity: 0.5 }}>
              Sin clientes
            </p>
          </div>
        ) : (
          leads.map(lead => <LeadCard key={lead.id} lead={lead} onSelect={onSelect} />)
        )}
      </div>
    </div>
  )
}

function DetailDrawer({
  lead,
  onUpdate,
  onClose,
}: {
  lead: CobradorLead
  onUpdate: (l: CobradorLead) => void
  onClose: () => void
}) {
  const [notes, setNotes] = useState(lead.notes ?? '')
  const [montoPagado, setMontoPagado] = useState(String(lead.monto_pagado))
  const [savingNotes, setSavingNotes] = useState(false)
  const [savingMonto, setSavingMonto] = useState(false)
  const [movingTo, setMovingTo] = useState<string | null>(null)

  useEffect(() => {
    setNotes(lead.notes ?? '')
    setMontoPagado(String(lead.monto_pagado))
  }, [lead.id])

  const handleMove = async (stage: string) => {
    setMovingTo(stage)
    try {
      const updated = await updateCobradorStage(lead.id, stage)
      onUpdate(updated)
      toast.success('Etapa actualizada')
    } catch {
      toast.error('Error al mover')
    } finally {
      setMovingTo(null)
    }
  }

  const handleSaveNotes = async () => {
    if (notes === (lead.notes ?? '')) return
    setSavingNotes(true)
    try {
      const updated = await updateCobradorNotes(lead.id, notes)
      onUpdate(updated)
      toast.success('Notas guardadas')
    } catch {
      toast.error('Error')
    } finally {
      setSavingNotes(false)
    }
  }

  const handleSaveMonto = async () => {
    const val = parseFloat(montoPagado) || 0
    if (val === lead.monto_pagado) return
    setSavingMonto(true)
    try {
      const updated = await updateCobradorMontoPagado(lead.id, val)
      onUpdate(updated)
      toast.success('Monto actualizado')
    } catch {
      toast.error('Error')
    } finally {
      setSavingMonto(false)
    }
  }

  const stageDef = STAGES.find(s => s.key === lead.stage)!
  const pendiente = Math.max(lead.monto_deuda - lead.monto_pagado, 0)
  const pct = lead.monto_deuda > 0 ? Math.min((lead.monto_pagado / lead.monto_deuda) * 100, 100) : 0

  return (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ background: 'rgba(0,0,0,0.40)' }}
      onClick={onClose}
    >
      <div
        className="ml-auto h-full w-full max-w-sm flex flex-col overflow-hidden"
        style={{
          background: 'var(--bg)',
          boxShadow: '-12px 0 40px rgba(0,0,0,0.18)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header band */}
        <div style={{ background: stageDef.headerBg }} className="flex-shrink-0">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm text-white flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.20)' }}
                >
                  {initials(lead.nombre)}
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-black text-white leading-tight truncate">
                    {lead.nombre}
                  </h2>
                  {lead.empresa && (
                    <p className="text-[11px] text-white/70 truncate">{lead.empresa}</p>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.20)' }}
              >
                <X size={14} color="white" />
              </button>
            </div>
          </div>

          {/* Deuda summary strip */}
          <div
            className="px-5 py-3 flex items-center gap-4"
            style={{ background: 'rgba(0,0,0,0.15)' }}
          >
            <div className="flex-1 min-w-0">
              <div className="h-2 rounded-full overflow-hidden mb-1.5" style={{ background: 'rgba(255,255,255,0.20)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: 'rgba(255,255,255,0.85)' }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-white/80">
                <span>{fmt(lead.monto_pagado)} cobrado</span>
                <span>{pct.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Montos row */}
        <div
          className="grid grid-cols-3 divide-x flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          {[
            { label: 'Total', value: fmt(lead.monto_deuda), color: 'var(--text)' },
            { label: 'Cobrado', value: fmt(lead.monto_pagado), color: '#10B981' },
            { label: 'Pendiente', value: fmt(pendiente), color: pendiente > 0 ? '#EF4444' : '#10B981' },
          ].map(item => (
            <div key={item.label} className="px-3 py-3 text-center">
              <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>
                {item.label}
              </p>
              <p className="text-xs font-black" style={{ color: item.color }}>{item.value}</p>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Stage movers */}
          <div className="px-4 pt-4 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-muted)' }}>
              Mover a etapa
            </p>
            <div className="space-y-2">
              {STAGES.filter(s => s.key !== lead.stage).map(s => (
                <button
                  key={s.key}
                  onClick={() => handleMove(s.key)}
                  disabled={!!movingTo}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: s.light,
                    border: `1.5px solid ${s.border}`,
                    color: s.color,
                  }}
                >
                  {movingTo === s.key ? (
                    <div
                      className="w-3.5 h-3.5 rounded-full border-2 animate-spin flex-shrink-0"
                      style={{ borderColor: 'transparent', borderTopColor: s.color }}
                    />
                  ) : (
                    <ArrowRight size={13} className="flex-shrink-0" />
                  )}
                  <span>{s.label}</span>
                  <span className="ml-auto text-[10px] opacity-60">{s.sublabel}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '0 16px' }} />

          {/* Monto cobrado editor */}
          <div className="px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              Monto cobrado ($)
            </p>
            <div className="flex gap-2">
              <input
                className="input flex-1 text-sm"
                type="number"
                min="0"
                step="1000"
                value={montoPagado}
                onChange={e => setMontoPagado(e.target.value)}
              />
              <button
                onClick={handleSaveMonto}
                disabled={savingMonto}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: 'rgba(67,97,238,0.12)',
                  color: '#4361ee',
                  border: '1.5px solid rgba(67,97,238,0.25)',
                }}
              >
                {savingMonto ? '...' : 'OK'}
              </button>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '0 16px' }} />

          {/* Contact info */}
          {(lead.telefono || lead.email || lead.rut) && (
            <>
              <div className="px-4 py-3 space-y-2">
                {lead.rut && (
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <TrendingUp size={12} />
                    <span className="font-mono">{lead.rut}</span>
                  </div>
                )}
                {lead.telefono && (
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <Phone size={12} />
                    <span>{lead.telefono}</span>
                  </div>
                )}
                {lead.email && (
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <Mail size={12} />
                    <span>{lead.email}</span>
                  </div>
                )}
              </div>
              <div style={{ height: 1, background: 'var(--border)', margin: '0 16px' }} />
            </>
          )}

          {/* Notes */}
          <div className="px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              Notas
            </p>
            <textarea
              className="input w-full text-sm"
              rows={4}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observaciones, acuerdos de pago..."
              style={{ resize: 'vertical' }}
            />
            <button
              onClick={handleSaveNotes}
              disabled={savingNotes || notes === (lead.notes ?? '')}
              className="mt-2 w-full py-2 rounded-xl text-xs font-bold transition-all"
              style={{
                background: 'rgba(67,97,238,0.10)',
                color: '#4361ee',
                border: '1.5px solid rgba(67,97,238,0.22)',
                opacity: notes === (lead.notes ?? '') ? 0.45 : 1,
              }}
            >
              {savingNotes ? 'Guardando...' : 'Guardar Notas'}
            </button>
          </div>

          {lead.descripcion && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '0 16px' }} />
              <div className="px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                  Descripción
                </p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {lead.descripcion}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CobradoresPipeline() {
  const [leads, setLeads] = useState<CobradorLead[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<CobradorLead | null>(null)

  const load = () => {
    setLoading(true)
    getCobradorLeads()
      .then((data: CobradorLead[]) => {
        setLeads(data)
        if (selected) {
          const fresh = data.find(l => l.id === selected.id)
          if (fresh) setSelected(fresh)
        }
      })
      .catch(() => toast.error('Error cargando pipeline'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleUpdate = (updated: CobradorLead) => {
    setLeads(prev => prev.map(l => (l.id === updated.id ? updated : l)))
    setSelected(updated)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 72px)' }}>
      {/* Page header */}
      <div className="mb-5 flex-shrink-0 flex items-end justify-between">
        <div>
          <h1
            className="text-xl font-black"
            style={{ color: 'var(--text)', fontFamily: '"Space Grotesk", sans-serif' }}
          >
            Pipeline de Cobranza
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {leads.length} cliente{leads.length !== 1 ? 's' : ''} en cartera
          </p>
        </div>
        <div className="flex items-center gap-4">
          {STAGES.map(s => {
            const count = leads.filter(l => l.stage === s.key).length
            return (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                  {count} {s.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto" style={{ minHeight: 0 }}>
        <div className="flex gap-4 h-full pb-4" style={{ minWidth: 'max-content' }}>
          {STAGES.map(stage => (
            <KanbanColumn
              key={stage.key}
              stage={stage}
              leads={leads.filter(l => l.stage === stage.key)}
              onSelect={setSelected}
            />
          ))}
        </div>
      </div>

      {selected && (
        <DetailDrawer
          key={selected.id}
          lead={selected}
          onUpdate={handleUpdate}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
