import { useState, useEffect } from 'react'
import { X, User, Building2, Phone, DollarSign, ArrowRight, StickyNote } from 'lucide-react'
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
  descripcion?: string | null
  stage: string
  notes?: string | null
  created_at?: string
}

const STAGES = [
  { key: 'lead_moroso',       label: 'Lead Moroso',       color: '#EF4444', bg: 'rgba(239,68,68,0.06)',   border: 'rgba(239,68,68,0.25)' },
  { key: 'pago_comprometido', label: 'Pago Comprometido', color: '#F59E0B', bg: 'rgba(245,158,11,0.06)',  border: 'rgba(245,158,11,0.25)' },
  { key: 'pagado',            label: 'Pagado',            color: '#10B981', bg: 'rgba(16,185,129,0.06)',  border: 'rgba(16,185,129,0.25)' },
]

function fmt(n: number) {
  return `$${Math.round(n).toLocaleString('es-CL')}`
}

function LeadCard({ lead, onSelect }: { lead: CobradorLead; onSelect: (l: CobradorLead) => void }) {
  const stage = STAGES.find(s => s.key === lead.stage)!
  const pct = lead.monto_deuda > 0 ? Math.min((lead.monto_pagado / lead.monto_deuda) * 100, 100) : 0

  return (
    <button onClick={() => onSelect(lead)}
      className="w-full text-left rounded-xl p-3 transition-all"
      style={{ background: '#fff', border: `1px solid ${stage.border}`, boxShadow: '0 1px 4px rgba(26,32,53,0.06)' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(26,32,53,0.12)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(26,32,53,0.06)'; (e.currentTarget as HTMLElement).style.transform = 'none' }}>

      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-xs text-white"
          style={{ background: `linear-gradient(135deg,${stage.color} 0%, ${stage.color}aa 100%)` }}>
          {lead.nombre.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-xs truncate leading-tight" style={{ color: 'var(--text)' }}>{lead.nombre}</p>
          {lead.empresa && (
            <p className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }}>{lead.empresa}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>{fmt(lead.monto_deuda)}</span>
        <span className="text-[10px] font-semibold" style={{ color: stage.color }}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(26,32,53,0.08)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: stage.color }} />
      </div>
    </button>
  )
}

function DetailDrawer({ lead, onUpdate, onClose }: {
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
    } catch { toast.error('Error al mover') }
    finally { setMovingTo(null) }
  }

  const handleSaveNotes = async () => {
    if (notes === (lead.notes ?? '')) return
    setSavingNotes(true)
    try {
      const updated = await updateCobradorNotes(lead.id, notes)
      onUpdate(updated)
      toast.success('Notas guardadas')
    } catch { toast.error('Error') }
    finally { setSavingNotes(false) }
  }

  const handleSaveMonto = async () => {
    const val = parseFloat(montoPagado) || 0
    if (val === lead.monto_pagado) return
    setSavingMonto(true)
    try {
      const updated = await updateCobradorMontoPagado(lead.id, val)
      onUpdate(updated)
      toast.success('Monto actualizado')
    } catch { toast.error('Error') }
    finally { setSavingMonto(false) }
  }

  const currentStageDef = STAGES.find(s => s.key === lead.stage)
  const pendiente = lead.monto_deuda - lead.monto_pagado
  const pct = lead.monto_deuda > 0 ? Math.min((lead.monto_pagado / lead.monto_deuda) * 100, 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
      <div className="ml-auto h-full w-full max-w-md flex flex-col overflow-hidden"
        style={{ background: '#fff', boxShadow: '-8px 0 32px rgba(26,32,53,0.15)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-black" style={{ color: 'var(--text)', fontFamily: '"Space Grotesk", sans-serif' }}>{lead.nombre}</h2>
              {lead.empresa && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{lead.empresa}</p>}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <X size={16} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: currentStageDef?.color }} />
            <span className="text-xs font-semibold" style={{ color: currentStageDef?.color }}>{currentStageDef?.label}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Deuda summary */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.20)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: '#065f46' }}>Resumen Deuda</p>
            <div className="h-2 rounded-full mb-3 overflow-hidden" style={{ background: 'rgba(16,185,129,0.15)' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: '#10B981', borderRadius: 99 }} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[9px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Total</p>
                <p className="text-xs font-bold" style={{ color: 'var(--text)' }}>{fmt(lead.monto_deuda)}</p>
              </div>
              <div>
                <p className="text-[9px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Cobrado</p>
                <p className="text-xs font-bold" style={{ color: '#10B981' }}>{fmt(lead.monto_pagado)}</p>
              </div>
              <div>
                <p className="text-[9px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Pendiente</p>
                <p className="text-xs font-bold" style={{ color: '#EF4444' }}>{fmt(Math.max(pendiente, 0))}</p>
              </div>
            </div>
          </div>

          {/* Quick stage move */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Mover a etapa</p>
            <div className="grid grid-cols-2 gap-1.5">
              {STAGES.filter(s => s.key !== lead.stage).map(s => (
                <button key={s.key} onClick={() => handleMove(s.key)} disabled={!!movingTo}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors"
                  style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
                  {movingTo === s.key ? (
                    <div className="w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: 'transparent', borderTopColor: s.color }} />
                  ) : (
                    <ArrowRight size={10} />
                  )}
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Monto pagado */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Monto Cobrado ($)</p>
            <div className="flex gap-2">
              <input className="input flex-1" type="number" min="0" step="1000"
                value={montoPagado} onChange={e => setMontoPagado(e.target.value)} />
              <button onClick={handleSaveMonto} disabled={savingMonto}
                className="px-3 py-2 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(67,97,238,0.10)', color: '#4361ee', border: '1px solid rgba(67,97,238,0.25)' }}>
                {savingMonto ? '...' : 'OK'}
              </button>
            </div>
          </div>

          {/* Contact info */}
          <div className="space-y-1.5">
            {lead.telefono && (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <Phone size={12} /> <span>{lead.telefono}</span>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span className="text-[11px]">@</span> <span>{lead.email}</span>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Notas</p>
            <textarea className="input w-full" rows={5} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Observaciones, acuerdos..." style={{ resize: 'vertical' }} />
            <button onClick={handleSaveNotes} disabled={savingNotes || notes === (lead.notes ?? '')}
              className="mt-2 w-full py-2 rounded-xl text-xs font-semibold transition-all"
              style={{ background: 'rgba(67,97,238,0.10)', color: '#4361ee', border: '1px solid rgba(67,97,238,0.25)', opacity: notes === (lead.notes ?? '') ? 0.5 : 1 }}>
              {savingNotes ? 'Guardando...' : 'Guardar Notas'}
            </button>
          </div>

          {lead.descripcion && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Descripción</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>{lead.descripcion}</p>
            </div>
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
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
    setSelected(updated)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-xl font-black" style={{ color: 'var(--text)', fontFamily: '"Space Grotesk", sans-serif' }}>
          Pipeline de Cobranza
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Vista kanban — {leads.length} cliente{leads.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 min-w-max h-full pb-4" style={{ minHeight: 400 }}>
          {STAGES.map(stage => {
            const colLeads = leads.filter(l => l.stage === stage.key)
            const totalCol = colLeads.reduce((a, l) => a + l.monto_deuda, 0)
            return (
              <div key={stage.key} className="flex flex-col rounded-2xl overflow-hidden flex-shrink-0"
                style={{ width: 240, background: stage.bg, border: `1px solid ${stage.border}` }}>
                {/* Column header */}
                <div className="px-3 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${stage.border}` }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                      <span className="text-xs font-bold" style={{ color: stage.color }}>{stage.label}</span>
                    </div>
                    <span className="text-xs font-black px-2 py-0.5 rounded-full text-white"
                      style={{ background: stage.color, minWidth: 20, textAlign: 'center' }}>
                      {colLeads.length}
                    </span>
                  </div>
                  {totalCol > 0 && (
                    <p className="text-[10px] font-semibold ml-4" style={{ color: stage.color }}>
                      {fmt(totalCol)}
                    </p>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {colLeads.map(lead => (
                    <LeadCard key={lead.id} lead={lead} onSelect={setSelected} />
                  ))}
                  {colLeads.length === 0 && (
                    <div className="flex items-center justify-center h-20 text-[11px] font-medium" style={{ color: stage.color, opacity: 0.5 }}>
                      Sin clientes
                    </div>
                  )}
                </div>
              </div>
            )
          })}
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
