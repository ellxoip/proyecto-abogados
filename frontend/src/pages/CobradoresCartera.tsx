import { useState, useEffect, useRef } from 'react'
import { Search, X, User, DollarSign, Building2, Phone, FileText, ChevronDown, StickyNote, Send, MessageSquare, Smartphone, RefreshCw, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  getCobradorLeads, updateCobradorStage, updateCobradorNotes, updateCobradorMontoPagado,
  getAllWhatsAppConfigs, getWhatsAppMessages, sendWhatsAppMessage, markMessagesRead,
  syncCobradorLeads, getCobradorPortalUrl,
} from '../api'
import { API_BASE_URL } from '../api/client'
import { useAuthStore } from '../store/auth'

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
  lf_cuotas_vencidas?: number | null
  pagacuotas_cliente_id?: number | null
  portal_url?: string | null
  descripcion?: string | null
  stage: string
  notes?: string | null
  created_at?: string
  contact?: { id: number; name: string; phone: string; email: string | null } | null
}

const STAGES: Record<string, { label: string; color: string; dot: string }> = {
  lead_moroso:       { label: 'Lead Moroso',       color: 'rgba(239,68,68,0.15)',   dot: '#EF4444' },
  pago_comprometido: { label: 'Pago Comprometido', color: 'rgba(245,158,11,0.15)',  dot: '#F59E0B' },
  pagado:            { label: 'Pagado',             color: 'rgba(16,185,129,0.15)',  dot: '#10B981' },
}

function fmt(n: number) {
  return `$${Math.round(n).toLocaleString('es-CL')}`
}

function StageBadge({ stage }: { stage: string }) {
  const s = STAGES[stage] ?? { label: stage, color: 'rgba(107,114,128,0.15)', dot: '#6B7280' }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
      style={{ background: s.color, color: s.dot }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between py-2 gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
      <dt className="text-xs font-medium flex-shrink-0 w-28" style={{ color: 'var(--text-muted)' }}>{label}</dt>
      <dd className="text-sm font-semibold text-right break-all" style={{ color: 'var(--text)' }}>{value}</dd>
    </div>
  )
}

function StageSelector({ lead, onUpdate }: { lead: CobradorLead; onUpdate: (l: CobradorLead) => void }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = async (stage: string) => {
    if (stage === lead.stage) { setOpen(false); return }
    setSaving(true); setOpen(false)
    try {
      const updated = await updateCobradorStage(lead.id, stage)
      onUpdate(updated)
      toast.success('Etapa actualizada')
    } catch { toast.error('Error al actualizar') }
    finally { setSaving(false) }
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)} disabled={saving}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all w-full"
        style={{ border: '1px solid rgba(26,32,53,0.14)', background: '#fff', color: 'var(--text)' }}>
        {saving
          ? <div className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
          : <span className="w-2 h-2 rounded-full" style={{ background: STAGES[lead.stage]?.dot ?? '#6B7280' }} />}
        <span className="flex-1 text-left">{STAGES[lead.stage]?.label ?? lead.stage}</span>
        <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl overflow-hidden"
          style={{ background: '#fff', border: '1px solid rgba(26,32,53,0.14)', boxShadow: '0 8px 24px rgba(26,32,53,0.12)' }}>
          {Object.entries(STAGES).map(([key, s]) => (
            <button key={key} onClick={() => handleSelect(key)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-gray-50"
              style={{ color: lead.stage === key ? s.dot : 'var(--text)', background: lead.stage === key ? s.color : 'transparent' }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.dot }} />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Chat Tab ──────────────────────────────────────────────────────────────────

function ChatTab({ lead }: { lead: CobradorLead }) {
  const { user } = useAuthStore()
  const [messages, setMessages]     = useState<any[]>([])
  const [configs, setConfigs]       = useState<any[]>([])
  const [configId, setConfigId]     = useState('')
  const [msgText, setMsgText]       = useState('')
  const [sending, setSending]       = useState(false)
  const [loading, setLoading]       = useState(true)
  const [loadingUrl, setLoadingUrl] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    getAllWhatsAppConfigs().then((all: any[]) => {
      // Filter to configs owned by current cobrador
      const mine = all.filter((c: any) => c.owner_user_id === user?.id || c.is_active)
      const cobradorsOwn = all.filter((c: any) => c.owner_user_id === user?.id)
      const list = cobradorsOwn.length > 0 ? cobradorsOwn : mine
      setConfigs(list)
      if (list.length > 0) setConfigId(list[0].id.toString())
    }).catch(() => {})
  }, [user?.id])

  const loadMessages = () => {
    if (!lead.contact_id) { setLoading(false); return }
    getWhatsAppMessages({ contact_id: lead.contact_id })
      .then((m: any[]) => { setMessages(m.slice().reverse()); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    if (!lead.contact_id) { setLoading(false); return }
    setLoading(true)
    loadMessages()
    markMessagesRead(lead.contact_id).catch(() => {})
    pollRef.current = setInterval(loadMessages, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [lead.contact_id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!msgText.trim() || !configId || !lead.contact_id) return
    setSending(true)
    try {
      await sendWhatsAppMessage({
        contact_id: lead.contact_id,
        whatsapp_config_id: parseInt(configId),
        message: msgText.trim(),
        message_type: 'text',
      })
      setMsgText('')
      loadMessages()
    } catch { toast.error('Error al enviar') }
    finally { setSending(false) }
  }

  // No contact linked
  if (!lead.contact_id) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(37,211,102,0.10)', border: '1px solid rgba(37,211,102,0.25)' }}>
          <MessageSquare size={24} style={{ color: '#25D366' }} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Sin contacto de WhatsApp</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Este cliente aún no tiene un contacto vinculado.<br />
            {lead.telefono && <span>Teléfono: <strong>{lead.telefono}</strong></span>}
          </p>
        </div>
      </div>
    )
  }

  // No WA config connected
  if (!loading && configs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(67,97,238,0.10)', border: '1px solid rgba(67,97,238,0.20)' }}>
          <Smartphone size={24} style={{ color: '#4361ee' }} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Conecta tu WhatsApp</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Para chatear debes vincular tu número primero.
          </p>
        </div>
        <Link to="/mis-whatsapp"
          className="px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(67,97,238,0.10)', color: '#4361ee', border: '1px solid rgba(67,97,238,0.25)' }}>
          Ir a Mis WhatsApp
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Config selector */}
      {configs.length > 1 && (
        <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'rgba(26,32,53,0.02)' }}>
          <select className="input text-xs py-1" value={configId} onChange={e => setConfigId(e.target.value)}>
            {configs.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name} ({c.phone_number})</option>
            ))}
          </select>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2"
        style={{ background: 'linear-gradient(180deg, #f0f4f8 0%, #e8f5e9 100%)' }}>
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(0,0,0,0.1)', borderTopColor: '#25D366' }} />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: 'rgba(26,32,53,0.40)' }}>
            <MessageSquare size={28} style={{ opacity: 0.4 }} />
            <p className="text-xs">Sin mensajes aún</p>
          </div>
        )}
        {messages.map((msg: any) => {
          const isOut = msg.direction === 'out'
          const hasMedia = msg.message_type !== 'text' && msg.media_url
          return (
            <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[80%] rounded-2xl px-3 py-2 shadow-sm"
                style={{
                  background: isOut ? '#25D366' : '#ffffff',
                  borderRadius: isOut ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                }}>
                {hasMedia && (
                  <a href={`${API_BASE_URL}${msg.media_url}`} target="_blank" rel="noopener noreferrer"
                    className="block mb-1 text-[11px] underline"
                    style={{ color: isOut ? 'rgba(255,255,255,0.85)' : '#4361ee' }}>
                    📎 Archivo adjunto
                  </a>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words"
                  style={{ color: isOut ? '#ffffff' : '#1a2035' }}>
                  {msg.content}
                </p>
                <p className="text-[9px] mt-1 text-right"
                  style={{ color: isOut ? 'rgba(255,255,255,0.65)' : 'rgba(26,32,53,0.40)' }}>
                  {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Quick action: pre-fill portal URL */}
      {lead.pagacuotas_cliente_id && (
        <div className="px-3 py-2 flex-shrink-0" style={{ borderTop: '1px solid rgba(37,211,102,0.20)', background: 'rgba(37,211,102,0.04)' }}>
          <button
            onClick={async () => {
              setLoadingUrl(true)
              try {
                const r = await getCobradorPortalUrl(lead.id)
                setMsgText(r.message)
              } catch { toast.error('Error obteniendo enlace') }
              finally { setLoadingUrl(false) }
            }}
            disabled={loadingUrl}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg w-full transition-all"
            style={{ background: 'rgba(37,211,102,0.12)', color: '#16a34a', border: '1px solid rgba(37,211,102,0.30)' }}
          >
            <ExternalLink size={11} />
            {loadingUrl ? 'Cargando...' : 'Reenviar acceso PagaCuotas'}
          </button>
        </div>
      )}

      {/* Send form */}
      <form onSubmit={handleSend} className="flex gap-2 p-3 flex-shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: '#fff' }}>
        <input
          className="flex-1 rounded-2xl border px-4 py-2 text-sm outline-none focus:border-green-400 transition-colors"
          style={{ border: '1px solid rgba(26,32,53,0.14)', background: 'rgba(26,32,53,0.03)' }}
          placeholder="Escribe un mensaje..."
          value={msgText}
          onChange={e => setMsgText(e.target.value)}
          disabled={sending || !configId}
        />
        <button type="submit" disabled={sending || !msgText.trim() || !configId}
          className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40"
          style={{ background: '#25D366', color: '#fff' }}>
          {sending
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Send size={16} />}
        </button>
      </form>
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({ lead, onUpdate, onClose }: {
  lead: CobradorLead
  onUpdate: (l: CobradorLead) => void
  onClose?: () => void
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'chat' | 'notas'>('info')
  const [notes, setNotes] = useState(lead.notes ?? '')
  const [montoPagado, setMontoPagado] = useState(String(lead.monto_pagado))
  const [savingNotes, setSavingNotes] = useState(false)
  const [savingMonto, setSavingMonto] = useState(false)

  useEffect(() => {
    setNotes(lead.notes ?? '')
    setMontoPagado(String(lead.monto_pagado))
  }, [lead.id, lead.notes, lead.monto_pagado])

  const handleSaveNotes = async () => {
    if (notes === (lead.notes ?? '')) return
    setSavingNotes(true)
    try {
      const updated = await updateCobradorNotes(lead.id, notes)
      onUpdate(updated); toast.success('Notas guardadas')
    } catch { toast.error('Error al guardar') }
    finally { setSavingNotes(false) }
  }

  const handleSaveMonto = async () => {
    const val = parseFloat(montoPagado) || 0
    if (val === lead.monto_pagado) return
    setSavingMonto(true)
    try {
      const updated = await updateCobradorMontoPagado(lead.id, val)
      onUpdate(updated); toast.success('Monto actualizado')
    } catch { toast.error('Error al guardar') }
    finally { setSavingMonto(false) }
  }

  const pendiente = lead.monto_deuda - lead.monto_pagado
  const pct = lead.monto_deuda > 0 ? Math.min((lead.monto_pagado / lead.monto_deuda) * 100, 100) : 0

  const TABS = [
    { key: 'info',  label: 'Info' },
    { key: 'chat',  label: 'Chat' },
    { key: 'notas', label: 'Notas' },
  ] as const

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black leading-tight" style={{ color: 'var(--text)', fontFamily: '"Space Grotesk", sans-serif' }}>
              {lead.nombre}
            </h2>
            {lead.empresa && (
              <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <Building2 size={10} /> {lead.empresa}
              </p>
            )}
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
              <X size={16} />
            </button>
          )}
        </div>
        <StageBadge stage={lead.stage} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'rgba(26,32,53,0.02)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
            style={activeTab === t.key
              ? { background: '#4361ee', color: '#fff' }
              : { color: 'var(--text-muted)', background: 'transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'chat' ? (
        <ChatTab lead={lead} />
      ) : (
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'info' && (
            <>
              {/* HONORARIOS — read-only, data from external system */}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--bg-secondary, #f8fafc)', borderBottom: '1px solid var(--border)' }}>
                  <DollarSign size={13} style={{ color: '#4361ee' }} />
                  <span className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--text)' }}>Honorarios</span>
                </div>
                <dl>
                  <InfoRow label="Total" value={lead.monto_deuda > 0 ? fmt(lead.monto_deuda) : undefined} />
                  <InfoRow label="Nº Cuotas" value={lead.num_cuotas != null ? String(lead.num_cuotas) : '1'} />
                  <InfoRow label="Cuota inicial" value={lead.cuota_inicial != null ? fmt(lead.cuota_inicial) : undefined} />
                  <InfoRow label="Monto cuota" value={lead.monto_cuota != null ? fmt(lead.monto_cuota) : undefined} />
                </dl>
              </div>

              {/* Progreso de cobro */}
              <div className="rounded-xl p-4" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)' }}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold" style={{ color: '#065f46' }}>Progreso de Cobro</span>
                  <span className="text-xs font-semibold" style={{ color: '#10B981' }}>{pct.toFixed(0)}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(16,185,129,0.15)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#10B981,#34d399)' }} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div><p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Cobrado</p><p className="text-xs font-bold" style={{ color: '#10B981' }}>{fmt(lead.monto_pagado)}</p></div>
                  <div><p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Pendiente</p><p className="text-xs font-bold" style={{ color: pendiente > 0 ? '#EF4444' : '#10B981' }}>{fmt(Math.max(pendiente, 0))}</p></div>
                </div>
              </div>

              {/* Cuotas vencidas badge */}
              {(lead.lf_cuotas_vencidas ?? 0) > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#EF4444' }} />
                  <span className="text-xs font-semibold" style={{ color: '#EF4444' }}>
                    {lead.lf_cuotas_vencidas} cuota{(lead.lf_cuotas_vencidas ?? 0) > 1 ? 's' : ''} vencida{(lead.lf_cuotas_vencidas ?? 0) > 1 ? 's' : ''} · Legal Finance
                  </span>
                </div>
              )}

              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Etapa</label>
                <StageSelector lead={lead} onUpdate={onUpdate} />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Monto Cobrado ($)</label>
                <div className="flex gap-2">
                  <input className="input flex-1" type="number" min="0" step="1000"
                    value={montoPagado} onChange={e => setMontoPagado(e.target.value)} onBlur={handleSaveMonto} />
                  <button onClick={handleSaveMonto} disabled={savingMonto}
                    className="px-3 py-2 rounded-xl text-xs font-semibold"
                    style={{ background: 'rgba(67,97,238,0.10)', color: '#4361ee', border: '1px solid rgba(67,97,238,0.25)' }}>
                    {savingMonto ? '...' : 'OK'}
                  </button>
                </div>
              </div>

              <div className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(67,97,238,0.10)' }}>
                    <User size={13} style={{ color: '#4361ee' }} />
                  </div>
                  <h4 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Datos del Deudor</h4>
                </div>
                <dl>
                  <InfoRow label="Nombre"   value={lead.nombre} />
                  <InfoRow label="RUT"      value={lead.rut} />
                  <InfoRow label="Empresa"  value={lead.empresa} />
                  <InfoRow label="Teléfono" value={lead.telefono} />
                  <InfoRow label="Email"    value={lead.email} />
                </dl>
              </div>

              {lead.descripcion && (
                <div className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.10)' }}>
                      <FileText size={13} style={{ color: '#F59E0B' }} />
                    </div>
                    <h4 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Descripción</h4>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>{lead.descripcion}</p>
                </div>
              )}
            </>
          )}

          {activeTab === 'notas' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.10)' }}>
                  <StickyNote size={13} style={{ color: '#8B5CF6' }} />
                </div>
                <h4 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Notas internas</h4>
              </div>
              <textarea className="input w-full" rows={10} value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Observaciones, acuerdos, historial de contacto..."
                style={{ resize: 'vertical', minHeight: 180 }} />
              <button onClick={handleSaveNotes} disabled={savingNotes || notes === (lead.notes ?? '')}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                style={{ background: 'rgba(67,97,238,0.10)', color: '#4361ee', border: '1px solid rgba(67,97,238,0.25)', opacity: notes === (lead.notes ?? '') ? 0.5 : 1 }}>
                {savingNotes && <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: 'transparent', borderTopColor: '#4361ee' }} />}
                Guardar Notas
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CobradoresCartera() {
  const [leads, setLeads]       = useState<CobradorLead[]>([])
  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [search, setSearch]     = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [selected, setSelected] = useState<CobradorLead | null>(null)
  const [showDetail, setShowDetail] = useState(false)

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
      .catch(() => toast.error('Error cargando cartera'))
      .finally(() => setLoading(false))
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const r = await syncCobradorLeads()
      toast.success(`Sync completado — ${r.created} nuevos, ${r.updated} actualizados`)
      load()
    } catch {
      toast.error('Error sincronizando con Legal Finance')
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleUpdate = (updated: CobradorLead) => {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
    setSelected(updated)
  }

  const filtered = leads.filter(l => {
    if (stageFilter && l.stage !== stageFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        l.nombre.toLowerCase().includes(q) ||
        (l.empresa ?? '').toLowerCase().includes(q) ||
        (l.rut ?? '').includes(q)
      )
    }
    return true
  })

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black" style={{ color: 'var(--text)', fontFamily: '"Space Grotesk", sans-serif' }}>
              Cartera de Clientes
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {leads.length} cliente{leads.length !== 1 ? 's' : ''} en tu cartera
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex-shrink-0"
            style={{ background: 'rgba(16,185,129,0.10)', color: '#10B981', border: '1.5px solid rgba(16,185,129,0.25)' }}
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Sync Legal Finance'}
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input className="input pl-9 w-full" placeholder="Buscar cliente, empresa, RUT..."
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
              <X size={13} />
            </button>
          )}
        </div>
        <select className="input" value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={{ minWidth: 140 }}>
          <option value="">Todas las etapas</option>
          {Object.entries(STAGES).map(([k, s]) => (
            <option key={k} value={k}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: list */}
        <div className={`flex flex-col min-h-0 ${showDetail ? 'hidden md:flex md:w-[38%]' : 'w-full md:w-[38%]'} flex-shrink-0`}>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loading && (
              <div className="flex items-center justify-center h-32">
                <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm">Sin resultados</p>
              </div>
            )}
            {filtered.map(lead => {
              const s = STAGES[lead.stage] ?? { dot: '#6B7280', label: lead.stage, color: 'rgba(107,114,128,0.15)' }
              const pct = lead.monto_deuda > 0 ? Math.min((lead.monto_pagado / lead.monto_deuda) * 100, 100) : 0
              const isSelected = selected?.id === lead.id
              return (
                <button key={lead.id} onClick={() => { setSelected(lead); setShowDetail(true) }}
                  className="w-full text-left rounded-xl p-3.5 transition-all"
                  style={{
                    background: isSelected ? 'rgba(67,97,238,0.08)' : '#fff',
                    border: isSelected ? '2px solid rgba(67,97,238,0.40)' : '1px solid rgba(26,32,53,0.10)',
                    boxShadow: '0 1px 4px rgba(26,32,53,0.05)',
                  }}>
                  <div className="flex items-start gap-2.5">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm text-white"
                      style={{ background: `linear-gradient(135deg,${s.dot} 0%,${s.dot}99 100%)` }}>
                      {lead.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm truncate leading-tight" style={{ color: 'var(--text)' }}>{lead.nombre}</p>
                      {lead.empresa && <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{lead.empresa}</p>}
                    </div>
                    <span className="flex items-center gap-1 text-[10px] font-semibold flex-shrink-0 px-2 py-0.5 rounded-full"
                      style={{ background: s.color, color: s.dot }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
                      {s.label}
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
                      <span>{fmt(lead.monto_deuda)}</span>
                      <span>{pct.toFixed(0)}% cobrado</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(26,32,53,0.08)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.dot }} />
                    </div>
                  </div>
                  {lead.telefono && (
                    <div className="flex items-center gap-1 mt-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      <Phone size={9} /><span>{lead.telefono}</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: detail */}
        {(showDetail || selected) && (
          <div className={`flex-1 min-h-0 rounded-2xl overflow-hidden ${!showDetail ? 'hidden md:flex' : 'flex'} flex-col`}
            style={{ background: '#fff', border: '1px solid rgba(26,32,53,0.10)', boxShadow: '0 2px 8px rgba(26,32,53,0.06)' }}>
            {selected ? (
              <DetailPanel key={selected.id} lead={selected} onUpdate={handleUpdate}
                onClose={() => { setShowDetail(false); setSelected(null) }} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
                <User size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
                <p className="text-sm font-medium">Selecciona un cliente para ver el detalle</p>
              </div>
            )}
          </div>
        )}

        {!showDetail && !selected && (
          <div className="hidden md:flex flex-1 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(26,32,53,0.02)', border: '2px dashed rgba(26,32,53,0.10)' }}>
            <div className="text-center" style={{ color: 'var(--text-muted)' }}>
              <User size={40} style={{ marginBottom: 12, opacity: 0.25, margin: '0 auto 12px' }} />
              <p className="text-sm font-medium">Selecciona un cliente</p>
              <p className="text-xs mt-1">para ver su información</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
