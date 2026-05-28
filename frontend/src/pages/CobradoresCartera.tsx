import { useState, useEffect, useRef } from 'react'
import { Search, X, User, DollarSign, Building2, Phone, FileText, ChevronDown, StickyNote, Send, MessageSquare, Smartphone, RefreshCw, ExternalLink, Paperclip, Mic, Square, Clock, Check, CheckCheck, Trash2, Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  getCobradorLeads, updateCobradorStage, updateCobradorNotes, updateCobradorMontoPagado,
  getAllWhatsAppConfigs, getWhatsAppMessages, sendWhatsAppMessage, sendWhatsAppMedia,
  markMessagesRead, deleteWhatsAppMessage, editWhatsAppMessage, sendTypingPresence,
  retryWhatsAppMessage, syncCobradorLeads, getCobradorPortalUrl,
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
  lf_total_facturado?: number | null
  lf_total_pagado?: number | null
  proxima_cuota_fecha?: string | null
  proxima_cuota_monto?: number | null
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

// ── Chat helpers ──────────────────────────────────────────────────────────────

function formatRecSecs(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const WA_TICK_LABEL: Record<string, string> = { logged: 'Pendiente', sent: 'Enviado', delivered: 'Entregado', read: 'Leído', failed: 'Error' }
function WaTicks({ status }: { status: string }) {
  const label = WA_TICK_LABEL[status] ?? 'Enviado'
  if (status === 'failed')    return <span title={label} style={{ color:'#ef4444', fontSize:13, fontWeight:'bold', lineHeight:1 }}>!</span>
  if (status === 'logged')    return <span title={label}><Clock size={13} color="rgba(26,32,53,0.45)" /></span>
  if (status === 'read')      return <span title={label}><CheckCheck size={14} color="#53bdeb" strokeWidth={2.5} /></span>
  if (status === 'delivered') return <span title={label}><CheckCheck size={14} color="rgba(26,32,53,0.45)" strokeWidth={2.5} /></span>
  return <span title={label}><Check size={14} color="rgba(26,32,53,0.45)" strokeWidth={2.5} /></span>
}

function ChatMsgContent({ m }: { m: any }) {
  const type = m.message_type || 'text'
  const url = m.media_url || null
  if (type === 'image' || type === 'sticker' || (url && /\.(jpg|jpeg|png|webp|gif)$/i.test(url))) {
    if (!url) return <p className="text-xs opacity-60 italic">📷 Imagen</p>
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img src={url} alt="imagen" className="rounded-xl max-w-[220px] max-h-[220px] object-cover cursor-zoom-in" />
        {m.content && m.content !== '[Imagen]' && <p className="mt-1 text-sm whitespace-pre-wrap">{m.content}</p>}
      </a>
    )
  }
  if (type === 'audio' || (url && /\.(ogg|mp3|m4a|aac|opus|webm)$/i.test(url))) {
    if (!url) return <p className="text-xs opacity-60 italic">🎤 Audio</p>
    return <audio controls src={url} className="max-w-[220px] h-10 rounded-xl" />
  }
  if (type === 'video' || (url && /\.(mp4|webm|mov)$/i.test(url))) {
    if (!url) return <p className="text-xs opacity-60 italic">🎥 Video</p>
    return <video controls src={url} className="rounded-xl max-w-[220px] max-h-[160px]" />
  }
  if (type === 'document') {
    if (!url) return <p className="text-xs opacity-60 italic">📄 {m.content || 'Documento'}</p>
    const fname = url.split('/').pop() || 'archivo'
    return (
      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm underline opacity-90">
        <FileText size={14} className="flex-shrink-0" />
        <span className="truncate max-w-[180px]">{m.content || fname}</span>
      </a>
    )
  }
  return <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
}

function ChatMsgMenu({ x, y, msg, onClose, onDelete, onEdit, onRetry }: {
  x: number; y: number; msg: any
  onClose: () => void
  onDelete: (id: number) => void
  onEdit: (msg: any) => void
  onRetry: (msg: any) => void
}) {
  const isOut = msg.direction === 'out'
  const canEdit = isOut && msg.message_type === 'text' && msg.status !== 'logged'
  const canRetry = isOut && msg.status === 'logged' && msg.message_type === 'text'
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed z-50 rounded-xl overflow-hidden"
        style={{ top: y, left: x, background:'#fff', border:'1px solid rgba(26,32,53,0.12)', boxShadow:'0 8px 24px rgba(0,0,0,0.14)', minWidth:160 }}>
        {canRetry && (
          <button onClick={() => { onRetry(msg); onClose() }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-amber-50 transition-colors"
            style={{ color:'#d97706' }}>
            <RefreshCw size={14} color="#d97706" />Reintentar envío
          </button>
        )}
        {canEdit && (
          <button onClick={() => { onEdit(msg); onClose() }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors"
            style={{ color:'var(--text)' }}>
            <Pencil size={14} color="#6B7280" />Editar mensaje
          </button>
        )}
        <button onClick={() => { onDelete(msg.id); onClose() }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-red-50 transition-colors"
          style={{ color:'#EF4444' }}>
          <Trash2 size={14} color="#EF4444" />Eliminar mensaje
        </button>
      </div>
    </>
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
  const [mediaFile, setMediaFile]       = useState<File | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [isRecording, setIsRecording]   = useState(false)
  const [recordSecs, setRecordSecs]     = useState(0)
  const [ctxMenu, setCtxMenu]   = useState<{ x: number; y: number; msg: any } | null>(null)
  const [editingMsg, setEditingMsg] = useState<any | null>(null)
  const [editText, setEditText] = useState('')

  const endRef           = useRef<HTMLDivElement>(null)
  const fileInputRef     = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef   = useRef<Blob[]>([])
  const recordTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const typingTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollRef          = useRef<ReturnType<typeof setInterval> | null>(null)
  const sseRef           = useRef<EventSource | null>(null)
  const sseReconnectRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sseWatchdogRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadMsgsRef      = useRef<() => void>(() => {})

  useEffect(() => {
    getAllWhatsAppConfigs().then((all: any[]) => {
      const cobradorsOwn = all.filter((c: any) => c.owner_user_id === user?.id)
      const list = cobradorsOwn.length > 0 ? cobradorsOwn : all.filter((c: any) => c.is_active)
      setConfigs(list)
      if (list.length > 0) setConfigId(list[0].id.toString())
    }).catch(() => {})
  }, [user?.id])

  const loadMessages = () => {
    if (!lead.contact_id) { setLoading(false); return }
    getWhatsAppMessages({ contact_id: lead.contact_id })
      .then((data: any[]) => { setMessages(data.slice().reverse()); setLoading(false) })
      .catch(() => setLoading(false))
  }
  loadMsgsRef.current = loadMessages

  useEffect(() => {
    if (!lead.contact_id) { setLoading(false); return }
    setLoading(true)
    loadMessages()
    markMessagesRead(lead.contact_id).catch(() => {})

    const token = localStorage.getItem('token')
    if (token) {
      const connectSSE = () => {
        if (sseRef.current) { sseRef.current.close(); sseRef.current = null }
        const es = new EventSource(`${API_BASE_URL}/api/whatsapp/stream?token=${encodeURIComponent(token)}`)
        sseRef.current = es
        const resetWatchdog = () => {
          if (sseWatchdogRef.current) clearTimeout(sseWatchdogRef.current)
          sseWatchdogRef.current = setTimeout(() => {
            es.close(); sseRef.current = null
            loadMsgsRef.current()
            sseReconnectRef.current = setTimeout(connectSSE, 200)
          }, 25000)
        }
        resetWatchdog()
        es.onmessage = (e) => {
          resetWatchdog()
          let evt: any
          try { evt = JSON.parse(e.data) } catch { return }
          if (evt.type === 'connected' || evt.type === 'keepalive') return
          if (evt.type === 'new_message') {
            const msg = evt.message
            if (msg.contact_id === lead.contact_id) {
              setMessages(prev => {
                if (prev.some((m: any) => m.id === msg.id)) return prev
                return [...prev, msg]
              })
              markMessagesRead(lead.contact_id!).catch(() => {})
            }
          }
          if (evt.type === 'status_update') {
            setMessages(prev => prev.map((m: any) => m.id === evt.db_id ? { ...m, status: evt.status } : m))
          }
          if (evt.type === 'refresh') loadMsgsRef.current()
        }
        es.onerror = () => {
          if (sseWatchdogRef.current) clearTimeout(sseWatchdogRef.current)
          es.close(); sseRef.current = null
          loadMsgsRef.current()
          sseReconnectRef.current = setTimeout(connectSSE, 1000)
        }
      }
      connectSSE()
    }

    pollRef.current = setInterval(() => loadMsgsRef.current(), 30000)
    return () => {
      if (sseRef.current) sseRef.current.close()
      if (sseReconnectRef.current) clearTimeout(sseReconnectRef.current)
      if (sseWatchdogRef.current) clearTimeout(sseWatchdogRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    }
  }, [lead.contact_id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const clearMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview)
    setMediaFile(null); setMediaPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 16 * 1024 * 1024) { toast.error('El archivo no puede superar 16 MB'); return }
    clearMedia()
    setMediaFile(file)
    setMediaPreview(URL.createObjectURL(file))
  }

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop()
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      setIsRecording(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4']
      const mimeType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || ''
      const ext = mimeType.startsWith('audio/webm') ? 'webm' : mimeType.startsWith('audio/mp4') ? 'mp4' : 'ogg'
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = mr
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const actualMime = mr.mimeType || mimeType || 'audio/ogg'
        const blob = new Blob(audioChunksRef.current, { type: actualMime })
        const file = new File([blob], `audio_${Date.now()}.${ext}`, { type: actualMime })
        clearMedia()
        setMediaFile(file)
        setMediaPreview(URL.createObjectURL(blob))
        setRecordSecs(0)
      }
      mr.start(250)
      setIsRecording(true)
      setRecordSecs(0)
      recordTimerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000)
    } catch { toast.error('No se pudo acceder al micrófono') }
  }

  const handleSend = async () => {
    if (!lead.contact_id || !configId) return
    const hasMedia = !!mediaFile
    const hasText = !!msgText.trim()
    if (!hasMedia && !hasText) return

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    sendTypingPresence(parseInt(configId), lead.contact_id, false).catch(() => {})

    const optimisticText = hasMedia ? '' : msgText.trim()
    const optimisticId = Date.now() * -1
    if (!hasMedia && optimisticText) {
      setMessages(prev => [...prev, {
        id: optimisticId, contact_id: lead.contact_id,
        direction: 'out', message_type: 'text', content: optimisticText,
        status: 'logged', created_at: new Date().toISOString(),
      }])
      setMsgText('')
    }

    setSending(true)
    try {
      if (hasMedia) {
        const fd = new FormData()
        fd.append('file', mediaFile!)
        fd.append('contact_id', lead.contact_id.toString())
        fd.append('whatsapp_config_id', configId)
        fd.append('caption', msgText.trim())
        const result = await sendWhatsAppMedia(fd)
        if (result?.status === 'logged') toast.error('WhatsApp no conectado — archivo guardado sin enviar')
        clearMedia(); setMsgText('')
      } else {
        const result = await sendWhatsAppMessage({
          contact_id: lead.contact_id,
          whatsapp_config_id: parseInt(configId),
          message: optimisticText,
        })
        if (result?.status === 'logged') toast.error('WhatsApp no conectado — mensaje guardado sin enviar')
        if (result?.id) {
          setMessages(prev => prev.map(m => m.id === optimisticId ? { ...result, direction: 'out' } : m))
        } else {
          setMessages(prev => prev.filter(m => m.id !== optimisticId))
        }
      }
      loadMessages()
    } catch { toast.error('Error al enviar') }
    finally { setSending(false) }
  }

  const handleDeleteMsg = async (id: number) => {
    try { await deleteWhatsAppMessage(id); setMessages(prev => prev.filter(m => m.id !== id)) }
    catch { toast.error('Error al eliminar') }
  }

  const handleEditMsg = async () => {
    if (!editingMsg || !editText.trim()) return
    try {
      const updated = await editWhatsAppMessage(editingMsg.id, editText)
      setMessages(prev => prev.map(m => m.id === updated.id ? updated : m))
      setEditingMsg(null); setEditText('')
    } catch { toast.error('Error al editar') }
  }

  const handleRetryMsg = async (msg: any) => {
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'sent' } : m))
    try {
      const updated = await retryWhatsAppMessage(msg.id)
      setMessages(prev => prev.map(m => m.id === msg.id ? updated : m))
      if (updated.status === 'logged') {
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'logged' } : m))
        toast.error('WhatsApp no conectado — reintenta más tarde')
      }
    } catch {
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'logged' } : m))
      toast.error('Error al reenviar')
    }
  }

  const isImage = mediaFile?.type.startsWith('image/')
  const isAudio = mediaFile?.type.startsWith('audio/')

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

  if (!loading && configs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(67,97,238,0.10)', border: '1px solid rgba(67,97,238,0.20)' }}>
          <Smartphone size={24} style={{ color: '#4361ee' }} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Conecta tu WhatsApp</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Para chatear debes vincular tu número primero.</p>
        </div>
        <Link to="/mis-whatsapp" className="px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(67,97,238,0.10)', color: '#4361ee', border: '1px solid rgba(67,97,238,0.25)' }}>
          Ir a Mis WhatsApp
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(26,32,53,0.10)', background: '#f0f2f5' }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#25D366 0%,#128C7E 100%)' }}>
            {lead.nombre.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: '#1a2035' }}>{lead.nombre}</p>
            {lead.telefono && <p className="text-[10px]" style={{ color: 'rgba(26,32,53,0.55)' }}>{lead.telefono}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {configs.length > 1 && (
            <select className="text-[10px] rounded-lg border px-2 py-1 outline-none"
              style={{ background: '#fff', border: '1px solid rgba(26,32,53,0.12)', color: '#1a2035' }}
              value={configId} onChange={e => setConfigId(e.target.value)}>
              {configs.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {lead.telefono && (
            <a href={`tel:${lead.telefono}`}
              className="flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-green-100"
              style={{ color: '#25D366' }}
              title={`Llamar a ${lead.nombre}`}>
              <Phone size={16} />
            </a>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col"
        style={{
          backgroundColor: '#e5ddd5',
          backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}>
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(0,0,0,0.1)', borderTopColor: '#25D366' }} />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ color: 'rgba(26,32,53,0.40)' }}>
            <MessageSquare size={28} style={{ opacity: 0.4 }} />
            <p className="text-xs">Sin mensajes aún</p>
          </div>
        )}
        {messages.length > 0 && (
          <>
            <div className="flex-1" />
            <div className="py-3 px-[3%] space-y-0.5">
              {messages.map((msg: any) => {
                const isOut = msg.direction === 'out'
                const bubbleBg = isOut ? '#dcf8c6' : '#ffffff'
                return (
                  <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'} mb-0.5 group`}>
                    <div className="relative max-w-[78%]"
                      style={{ marginRight: isOut ? 8 : 0, marginLeft: isOut ? 0 : 8 }}>
                      <div style={{
                        position: 'absolute', bottom: 0,
                        ...(isOut ? { right: -8 } : { left: -8 }),
                        width: 8, height: 13,
                        backgroundColor: bubbleBg,
                        clipPath: isOut ? 'polygon(0 0, 0 100%, 100% 100%)' : 'polygon(100% 0, 0 100%, 100% 100%)',
                      }} />
                      <div
                        onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, msg }) }}
                        style={{
                          backgroundColor: bubbleBg,
                          borderRadius: isOut ? '7.5px 7.5px 0 7.5px' : '7.5px 7.5px 7.5px 0',
                          padding: '6px 9px 8px 9px',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                          color: '#1a2035',
                          position: 'relative', zIndex: 1, cursor: 'default',
                          wordBreak: 'break-word',
                          border: '1px solid rgba(0,0,0,0.05)',
                        }}>
                        <ChatMsgContent m={msg} />
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          {isOut && msg.status === 'logged' && (
                            <button onClick={() => handleRetryMsg(msg)} title="No enviado — clic para reintentar"
                              style={{ fontSize:10, color:'#d97706', cursor:'pointer' }}>
                              ↺ No enviado
                            </button>
                          )}
                          <span style={{ color:'rgba(26,32,53,0.45)', fontSize:11, whiteSpace:'nowrap' }}>
                            {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' }) : ''}
                          </span>
                          {isOut && <WaTicks status={msg.status} />}
                        </div>
                      </div>
                      <button onClick={e => setCtxMenu({ x: e.clientX, y: e.clientY, msg })}
                        className="absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0.5"
                        style={{ ...(isOut ? { left: -20 } : { right: -20 }), backgroundColor: bubbleBg, color:'rgba(26,32,53,0.50)' }}>
                        ▾
                      </button>
                    </div>
                  </div>
                )
              })}
              <div ref={endRef} />
            </div>
          </>
        )}
      </div>

      {/* Media preview bar */}
      {(mediaFile || isRecording) && (
        <div className="px-3 py-2 flex items-center gap-3 flex-shrink-0"
          style={{ background: '#f0f2f5', borderTop: '1px solid rgba(26,32,53,0.10)' }}>
          {isRecording ? (
            <>
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <span className="text-sm font-semibold text-red-500">{formatRecSecs(recordSecs)}</span>
              <span className="text-xs" style={{ color:'rgba(26,32,53,0.55)' }}>Grabando audio...</span>
            </>
          ) : isImage && mediaPreview ? (
            <>
              <img src={mediaPreview} alt="preview" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
              <span className="text-xs truncate flex-1" style={{ color:'#1a2035' }}>{mediaFile!.name}</span>
            </>
          ) : isAudio ? (
            <>
              <Mic size={18} color="#8696a0" className="flex-shrink-0" />
              <audio controls src={mediaPreview!} className="h-8 flex-1" />
            </>
          ) : (
            <>
              <FileText size={18} color="#8696a0" className="flex-shrink-0" />
              <span className="text-xs truncate flex-1" style={{ color:'#1a2035' }}>{mediaFile!.name}</span>
            </>
          )}
          {!isRecording && (
            <button onClick={clearMedia} className="p-1 rounded-full hover:bg-gray-200 transition-colors flex-shrink-0">
              <X size={15} style={{ color:'rgba(26,32,53,0.50)' }} />
            </button>
          )}
        </div>
      )}

      {/* Quick action: portal URL */}
      {lead.pagacuotas_cliente_id && (
        <div className="px-3 py-1.5 flex-shrink-0"
          style={{ background: 'rgba(37,211,102,0.05)', borderTop: '1px solid rgba(37,211,102,0.15)' }}>
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
            style={{ background: 'rgba(37,211,102,0.12)', color: '#16a34a', border: '1px solid rgba(37,211,102,0.25)' }}>
            <ExternalLink size={11} />
            {loadingUrl ? 'Cargando...' : 'Reenviar acceso PagaCuotas'}
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-end gap-2 px-3 py-2 flex-shrink-0"
        style={{ background: '#f0f2f5', borderTop: '1px solid rgba(26,32,53,0.10)' }}>
        <input ref={fileInputRef} type="file"
          accept="image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
          className="hidden" onChange={handleFileSelect} />
        <button onClick={() => fileInputRef.current?.click()} disabled={isRecording}
          className="p-2 rounded-full hover:bg-gray-200 transition-colors flex-shrink-0 disabled:opacity-30"
          style={{ color:'rgba(26,32,53,0.55)' }} title="Adjuntar archivo">
          <Paperclip size={20} />
        </button>
        <textarea
          className="flex-1 resize-none text-sm outline-none"
          style={{
            backgroundColor: '#fff', color: '#1a2035',
            borderRadius: 8, padding: '9px 12px',
            minHeight: 42, maxHeight: 120,
            border: '1px solid rgba(26,32,53,0.14)', lineHeight: '1.5',
          }}
          rows={1}
          value={msgText}
          placeholder={mediaFile ? 'Añade un pie de foto (opcional)...' : 'Escribe un mensaje...'}
          onChange={e => {
            setMsgText(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            if (lead.contact_id && configId) {
              if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
              sendTypingPresence(parseInt(configId), lead.contact_id, true).catch(() => {})
              typingTimerRef.current = setTimeout(() => {
                sendTypingPresence(parseInt(configId), lead.contact_id!, false).catch(() => {})
              }, 3000)
            }
          }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          disabled={!configId}
        />
        <button onClick={toggleRecording} disabled={!!mediaFile && !isRecording}
          title={isRecording ? 'Detener grabación' : 'Grabar audio'}
          className="p-2 rounded-full transition-colors flex-shrink-0 disabled:opacity-30"
          style={{ backgroundColor: isRecording ? '#ef4444' : 'transparent', color: isRecording ? '#fff' : 'rgba(26,32,53,0.55)' }}>
          {isRecording ? <Square size={20} /> : <Mic size={20} />}
        </button>
        <button onClick={handleSend}
          disabled={sending || isRecording || (!msgText.trim() && !mediaFile) || !configId}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40"
          style={{ background: '#25D366', color: '#fff' }}>
          {sending
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Send size={18} />}
        </button>
      </div>

      {ctxMenu && (
        <ChatMsgMenu x={ctxMenu.x} y={ctxMenu.y} msg={ctxMenu.msg}
          onClose={() => setCtxMenu(null)}
          onDelete={handleDeleteMsg}
          onEdit={msg => { setEditingMsg(msg); setEditText(msg.content) }}
          onRetry={handleRetryMsg}
        />
      )}

      {editingMsg && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end justify-center z-50 pb-6 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
            style={{ border:'1px solid rgba(26,32,53,0.10)' }}>
            <div className="px-5 py-3.5 flex items-center justify-between"
              style={{ borderBottom:'1px solid rgba(26,32,53,0.10)' }}>
              <p className="font-semibold text-sm" style={{ color:'var(--text)' }}>Editar mensaje</p>
              <button onClick={() => setEditingMsg(null)} className="p-1 rounded-full hover:bg-gray-100 transition-colors">
                <X size={16} style={{ color:'rgba(26,32,53,0.50)' }} />
              </button>
            </div>
            <div className="p-4">
              <textarea autoFocus className="w-full resize-none text-sm rounded-xl px-3 py-2.5 outline-none"
                style={{ background:'rgba(26,32,53,0.04)', border:'1px solid rgba(26,32,53,0.12)', color:'var(--text)' }}
                rows={3} value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditMsg() } }}
              />
            </div>
            <div className="px-4 pb-4 flex gap-3">
              <button onClick={() => setEditingMsg(null)}
                className="flex-1 py-2 rounded-xl text-sm transition-colors"
                style={{ border:'1px solid rgba(26,32,53,0.12)', color:'rgba(26,32,53,0.60)' }}>
                Cancelar
              </button>
              <button onClick={handleEditMsg}
                className="flex-1 py-2 rounded-xl text-sm font-semibold"
                style={{ background:'#25D366', color:'#fff' }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
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
              {/* HONORARIOS — datos de Legal Finance, read-only */}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--bg-secondary, #f8fafc)', borderBottom: '1px solid var(--border)' }}>
                  <DollarSign size={13} style={{ color: '#4361ee' }} />
                  <span className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--text)' }}>Honorarios</span>
                </div>
                <dl>
                  <InfoRow label="Total facturado" value={lead.monto_deuda > 0 ? fmt(lead.monto_deuda) : undefined} />
                  <InfoRow label="Nº Cuotas" value={lead.num_cuotas != null ? String(lead.num_cuotas) : '1'} />
                  <InfoRow label="Cuota inicial" value={lead.cuota_inicial != null && lead.cuota_inicial > 0 ? fmt(lead.cuota_inicial) : undefined} />
                  <InfoRow label="Monto cuota" value={lead.monto_cuota != null && lead.monto_cuota > 0 ? fmt(lead.monto_cuota) : undefined} />
                </dl>
              </div>

              {/* Saldo de cobranza — 3 cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(67,97,238,0.07)', border: '1px solid rgba(67,97,238,0.18)' }}>
                  <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: 'rgba(67,97,238,0.7)' }}>Total facturado</p>
                  <p className="text-xs font-black" style={{ color: '#4361ee' }}>{fmt(lead.monto_deuda)}</p>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)' }}>
                  <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: 'rgba(16,185,129,0.8)' }}>Total pagado</p>
                  <p className="text-xs font-black" style={{ color: '#10B981' }}>{fmt(lead.monto_pagado)}</p>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ background: pendiente > 0 ? 'rgba(239,68,68,0.07)' : 'rgba(16,185,129,0.07)', border: `1px solid ${pendiente > 0 ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.18)'}` }}>
                  <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: pendiente > 0 ? 'rgba(239,68,68,0.8)' : 'rgba(16,185,129,0.8)' }}>Saldo pendiente</p>
                  <p className="text-xs font-black" style={{ color: pendiente > 0 ? '#EF4444' : '#10B981' }}>{fmt(Math.max(pendiente, 0))}</p>
                </div>
              </div>

              {/* Próxima cuota */}
              {lead.proxima_cuota_fecha && (
                <div className="rounded-xl px-4 py-3 flex items-center justify-between"
                  style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.22)' }}>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#D97706' }}>Próxima cuota</p>
                    <p className="text-sm font-black mt-0.5" style={{ color: 'var(--text)' }}>{lead.proxima_cuota_fecha}</p>
                  </div>
                  {lead.proxima_cuota_monto != null && lead.proxima_cuota_monto > 0 && (
                    <p className="text-base font-black" style={{ color: '#F59E0B' }}>{fmt(lead.proxima_cuota_monto)}</p>
                  )}
                </div>
              )}

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
