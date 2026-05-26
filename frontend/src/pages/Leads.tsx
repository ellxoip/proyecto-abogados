import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  getLeads, getLeadsCount, getLead, getGroups, deleteLead, getLeadHistory, updateLead, moveLeadStage,
  getWhatsAppMessages, sendWhatsAppMessage, sendWhatsAppMedia, markMessagesRead,
  deleteWhatsAppMessage, editWhatsAppMessage,
  getAllWhatsAppConfigs, downloadLeadPdf, updateContact,
  createCalendarEvent, getCalendarEvents, getGroupVendors, exportLeads,
  getContactAgentState, setContactAgentState, dismissAgentLead,
} from '../api'
import { apiUrl } from '../api/client'
import { playMessageSound, playNewLeadSound } from '../hooks/useNotificationSound'
import type { Lead } from '../types'
import { STAGE_LABELS, STAGE_COLORS } from '../types'
import {
  Plus, Search, Trash2, RefreshCw, MessageSquare, Send,
  Phone, Mail, MapPin, FileText, Clock, Download,
  ChevronDown, Info, History, StickyNote, SlidersHorizontal,
  User, Building2, Hash, CalendarDays, ChevronLeft, ChevronRight, Pencil, Check, X as XIcon,
  CalendarPlus, Clipboard, Paperclip, Mic, Square, CheckCheck, AlertTriangle, Bot, ArrowRight, ArrowLeft, ClipboardList,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/auth'
import LeadModal from '../components/LeadModal'
import { format, isToday, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseDate as parseAsUTC } from '../utils/dates'
import { rutOnChange } from '../utils/rut'
import { LeadDetailView } from './LeadDetail'
import { MoveLeadModal, NEXT_STAGE, PREV_STAGE } from '../components/MoveLeadModal'
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom'

const ALL_STAGES = [
  'lead', 'reunion', 'altamente_interesado', 'cierre',
  'pago_comprometido', 'pagado_confirmado',
  'recuperacion_lead', 'recuperacion_reunion', 'recuperacion_cierre', 'recuperacion_pago',
]
const CONFIRM_PAGO_ROLES = ['verificador']

const STAGE_DOT: Record<string, string> = {
  lead: 'bg-slate-500', reunion: 'bg-blue-500', altamente_interesado: 'bg-indigo-500',
  cierre: 'bg-violet-500', pago_comprometido: 'bg-amber-500', pagado_confirmado: 'bg-emerald-500',
  recuperacion_lead: 'bg-red-400', recuperacion_reunion: 'bg-red-400', recuperacion_cierre: 'bg-red-400', recuperacion_pago: 'bg-red-400',
}

const PRIORITY_COLOR: Record<string, string> = {
  high: 'text-danger bg-danger/10 border-danger/25',
  normal: 'text-neon bg-neon/10 border-neon/25',
  low: 'text-white/52 bg-white/[0.05] border-white/10',
}
const PRIORITY_LABEL: Record<string, string> = { high: 'Alta', normal: 'Normal', low: 'Baja' }

function fmt(n: number) { return n ? `$${Math.round(n).toLocaleString('es-CL')}` : '$0' }

function ExportButton() {
  const [loading, setLoading] = React.useState(false)
  const { user } = useAuthStore()
  const planAllows = user?.negocio_plan_limits?.export_csv ?? false
  const handleExport = async () => {
    if (!planAllows) { toast.error('Exportar CSV requiere plan Pro o superior'); return }
    setLoading(true)
    try { await exportLeads() }
    catch { toast.error('Error al exportar') }
    finally { setLoading(false) }
  }
  return (
    <button onClick={handleExport} disabled={loading}
      className="flex items-center gap-1.5 border border-white/10 bg-surface-1 hover:bg-surface-0 text-white/78 text-sm font-semibold px-3 py-2 sm:py-2.5 rounded-xl transition-colors shadow-sm disabled:opacity-50"
      title={!planAllows ? 'Plan Pro requerido' : 'Exportar CSV'}
      style={!planAllows ? { opacity: 0.45, cursor: 'not-allowed' } : {}}>
      <Download size={14} className={loading ? 'animate-spin' : ''} />
      <span className="hidden sm:inline">Exportar</span>
    </button>
  )
}

function formatMsgTime(iso: string) {
  const d = new Date(iso)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Ayer'
  return format(d, 'd MMM', { locale: es })
}

// ── Row helpers ───────────────────────────────────────────
function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center px-3.5 py-2.5 border-b border-white/[0.07] last:border-0">
      <span className="w-28 flex-shrink-0 text-xs text-white/52 font-semibold">{label}</span>
      <span className="flex-1 text-sm text-white/88 font-semibold">{value || <span className="text-white/30">—</span>}</span>
    </div>
  )
}

const fmtCLP = (n: number | string | null | undefined) => {
  const num = Number(n)
  if (!n || isNaN(num) || num === 0) return ''
  return `$${Math.round(num).toLocaleString('es-CL')}`
}

function EditableRow({ label, value, onSave, type = 'text', placeholder, isMoney = false, transform }: {
  label: string
  value: string | number | null | undefined
  onSave: (v: string) => Promise<void>
  type?: 'text' | 'number' | 'email' | 'tel'
  placeholder?: string
  isMoney?: boolean
  transform?: (v: string) => string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const start = () => { setDraft(value?.toString() ?? ''); setEditing(true) }
  const cancel = () => setEditing(false)

  const save = async () => {
    const v = draft.trim()
    if (v === (value?.toString() ?? '').trim()) { setEditing(false); return }
    setSaving(true)
    try { await onSave(v); setEditing(false) }
    catch { toast.error('Error al guardar') }
    finally { setSaving(false) }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); save() }
    if (e.key === 'Escape') cancel()
  }

  const displayVal = isMoney ? fmtCLP(value) : value?.toString()

  return (
    <div className="flex items-center px-3.5 py-2.5 border-b border-white/[0.07] last:border-0 group">
      <span className="w-28 flex-shrink-0 text-xs text-white/52 font-semibold">{label}</span>
      {editing ? (
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              type={type}
              value={draft}
              onChange={e => setDraft(transform ? transform(e.target.value) : e.target.value)}
              onKeyDown={onKey}
              onBlur={save}
              placeholder={placeholder}
              className="flex-1 text-sm border border-white/15 bg-surface-0 text-white/90 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-white/15 focus:border-white/25 min-w-0"
            />
            {saving
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              : <button onMouseDown={e => { e.preventDefault(); save() }} className="p-1.5 rounded-lg text-lime hover:bg-lime/10 flex-shrink-0"><Check size={13} /></button>
            }
            <button onMouseDown={e => { e.preventDefault(); cancel() }} className="p-1.5 rounded-lg text-white/38 hover:bg-surface-2 flex-shrink-0"><XIcon size={13} /></button>
          </div>
          {isMoney && draft && Number(draft) > 0 && (
            <span className="text-xs text-lime font-bold pl-1">= {fmtCLP(draft)}</span>
          )}
        </div>
      ) : (
        <button onClick={start} className="flex-1 flex items-center gap-2 text-left group/val min-w-0">
          <span className={`text-sm font-semibold flex-1 min-w-0 truncate ${displayVal ? (isMoney ? 'text-lime' : 'text-white/88') : 'text-white/32 italic'}`}>
            {displayVal || (placeholder ? `Agregar ${label.toLowerCase()}...` : '—')}
          </span>
          <Pencil size={12} className="flex-shrink-0 text-white/30 opacity-0 group-hover/val:opacity-100 transition-opacity" />
        </button>
      )}
    </div>
  )
}

function EditableSelectRow({ label, value, options, onSave }: {
  label: string
  value: string | null | undefined
  options: { value: string; label: string }[]
  onSave: (v: string) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const current = options.find(o => o.value === value)

  const handleChange = async (v: string) => {
    if (v === value) return
    setSaving(true)
    try { await onSave(v) }
    catch { toast.error('Error al guardar') }
    finally { setSaving(false) }
  }

  return (
    <div className="flex items-center px-3.5 py-2.5 border-b border-white/[0.07] last:border-0">
      <span className="w-28 flex-shrink-0 text-xs text-white/52 font-semibold">{label}</span>
      <div className="flex-1 flex items-center gap-2">
        <select
          value={value ?? ''}
          onChange={e => handleChange(e.target.value)}
          disabled={saving}
          className="text-sm border border-white/10 rounded-lg px-2.5 py-1.5 bg-surface-0 focus:outline-none focus:ring-2 focus:ring-white/15 focus:border-white/25 text-white/88 font-semibold cursor-pointer disabled:opacity-50"
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />}
      </div>
    </div>
  )
}

// ── Section heading ───────────────────────────────────────
function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-2 first:mt-0">
      <span className="w-0.5 h-3.5 rounded-full flex-shrink-0" style={{ background: 'var(--primary)' }} />
      <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">
        {children}
      </span>
    </div>
  )
}

// ── Chat Tab ─────────────────────────────────────────────
/* ── Fill Contact from Chat Modal ────────────────────────── */
function FillContactSplit({ messages, lead, onSave, onClose }: {
  messages: any[]
  lead: Lead
  onSave: (contactData: any, leadData: any) => Promise<void>
  onClose: () => void
}) {
  const endRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)

  const [contactForm, setContactForm] = useState({
    name: lead.contact?.name ?? '',
    phone: lead.contact?.phone ?? '',
    email: lead.contact?.email ?? '',
    rut_persona: lead.contact?.rut_persona ?? '',
    rut_empresa: lead.contact?.rut_empresa ?? '',
    razon_social: lead.contact?.razon_social ?? '',
    city: lead.contact?.city ?? '',
  })
  const [leadForm, setLeadForm] = useState({
    honorarios: lead.honorarios ? lead.honorarios.toString() : '',
    cuota_inicial: lead.cuota_inicial ? lead.cuota_inicial.toString() : '',
    num_cuotas: lead.num_cuotas ? lead.num_cuotas.toString() : '1',
    monto_cuota: lead.monto_cuota ? lead.monto_cuota.toString() : '',
    service_description: lead.service_description ?? '',
    notes: lead.notes ?? '',
    source: lead.source ?? 'whatsapp',
  })

  const setC = (k: string, v: string) => setContactForm(f => ({ ...f, [k]: v }))
  const setL = (k: string, v: string) => setLeadForm(f => {
    const updated = { ...f, [k]: v }
    if (k === 'cuota_inicial' || k === 'num_cuotas' || k === 'monto_cuota') {
      const ci = parseFloat(k === 'cuota_inicial' ? v : f.cuota_inicial) || 0
      const nc = parseInt(k === 'num_cuotas' ? v : f.num_cuotas) || 1
      const mc = parseFloat(k === 'monto_cuota' ? v : f.monto_cuota) || 0
      if (ci > 0 || mc > 0) {
        updated.honorarios = Math.round(ci + nc * mc).toString()
      }
    }
    return updated
  })

  const fmtP = (v: string) => {
    const n = parseFloat(v)
    return !v || isNaN(n) || n === 0 ? '' : `$${Math.round(n).toLocaleString('es-CL')}`
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'auto' }) }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(contactForm, leadForm)
      onClose()
    } catch { toast.error('Error guardando') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-stretch p-5">
      <div className="bg-surface-1 rounded-2xl shadow-2xl w-full max-w-5xl mx-auto flex overflow-hidden border border-white/[0.07]">

        {/* LEFT — form */}
        <div className="w-[440px] flex-shrink-0 flex flex-col border-r border-white/[0.07]">
          <div className="px-6 py-4 border-b border-white/[0.07] flex items-center justify-between flex-shrink-0">
            <div>
              <h3 className="font-bold text-white/90">Completar datos del lead</h3>
              <p className="text-xs text-white/45 mt-0.5">Rellena mirando el chat a la derecha</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-surface-2 rounded-xl text-white/45"><XIcon size={18} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <p className="text-[10px] font-bold text-white/38 uppercase tracking-widest">Contacto</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="input-label">Nombre *</label>
                <input className="input" value={contactForm.name} onChange={e => setC('name', e.target.value)} placeholder="Nombre completo" />
              </div>
              <div>
                <label className="input-label">Teléfono *</label>
                <input className="input" value={contactForm.phone} onChange={e => setC('phone', e.target.value)} placeholder="+56 9 1234 5678" />
              </div>
              <div>
                <label className="input-label">Correo</label>
                <input className="input" type="email" value={contactForm.email} onChange={e => setC('email', e.target.value)} placeholder="correo@email.com" />
              </div>
              <div>
                <label className="input-label">Ciudad</label>
                <input className="input" value={contactForm.city} onChange={e => setC('city', e.target.value)} placeholder="Santiago" />
              </div>
              <div>
                <label className="input-label">RUT Persona</label>
                <input className="input" value={contactForm.rut_persona} onChange={e => setC('rut_persona', rutOnChange(e.target.value))} placeholder="12.345.678-9" />
              </div>
              <div>
                <label className="input-label">RUT Empresa</label>
                <input className="input" value={contactForm.rut_empresa} onChange={e => setC('rut_empresa', rutOnChange(e.target.value))} placeholder="76.000.000-0" />
              </div>
              <div className="col-span-2">
                <label className="input-label">Razón Social</label>
                <input className="input" value={contactForm.razon_social} onChange={e => setC('razon_social', e.target.value)} placeholder="Nombre empresa" />
              </div>
            </div>

            <p className="text-[10px] font-bold text-white/38 uppercase tracking-widest pt-2">Lead</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="input-label">Honorarios</label>
                <input className="input" type="number" value={leadForm.honorarios} onChange={e => setL('honorarios', e.target.value)} placeholder="1200000" />
                {fmtP(leadForm.honorarios) && <p className="text-xs text-lime font-semibold mt-1">{fmtP(leadForm.honorarios)}</p>}
              </div>
              <div>
                <label className="input-label">N° Cuotas</label>
                <input className="input" type="number" min={1} value={leadForm.num_cuotas} onChange={e => setL('num_cuotas', e.target.value)} />
              </div>
              <div>
                <label className="input-label">Cuota inicial</label>
                <input className="input" type="number" value={leadForm.cuota_inicial} onChange={e => setL('cuota_inicial', e.target.value)} placeholder="Auto" />
                {fmtP(leadForm.cuota_inicial) && <p className="text-xs text-lime font-semibold mt-1">{fmtP(leadForm.cuota_inicial)}</p>}
              </div>
              <div>
                <label className="input-label">Monto por cuota</label>
                <input className="input" type="number" value={leadForm.monto_cuota} onChange={e => setL('monto_cuota', e.target.value)} placeholder="Auto" />
                {fmtP(leadForm.monto_cuota) && <p className="text-xs text-lime font-semibold mt-1">{fmtP(leadForm.monto_cuota)}</p>}
              </div>
              <div className="col-span-2">
                <label className="input-label">Descripción del servicio</label>
                <textarea className="input" rows={2} value={leadForm.service_description} onChange={e => setL('service_description', e.target.value)} placeholder="Ej: Liquidación concursal..." />
              </div>
              <div className="col-span-2">
                <label className="input-label">Notas internas</label>
                <textarea className="input" rows={2} value={leadForm.notes} onChange={e => setL('notes', e.target.value)} placeholder="Observaciones adicionales..." />
              </div>
              <div className="col-span-2">
                <label className="input-label">Fuente</label>
                <select className="input" value={leadForm.source} onChange={e => setL('source', e.target.value)}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="referido">Referido</option>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="web">Sitio Web</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-white/[0.07] flex gap-3 flex-shrink-0">
            <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 btn-primary disabled:opacity-40">
              {saving ? 'Guardando...' : 'Guardar datos'}
            </button>
          </div>
        </div>

        {/* RIGHT — chat (read-only), dark WA style */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-4 py-2.5 flex-shrink-0 border-b border-white/[0.07] flex items-center gap-3 bg-surface-0">
            {lead.contact?.avatar_url ? (
              <img
                src={lead.contact.avatar_url}
                alt={lead.contact?.name}
                className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                onError={e => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                  (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex'
                }}
              />
            ) : null}
            <div className="w-9 h-9 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0"
              style={{ display: lead.contact?.avatar_url ? 'none' : 'flex' }}>
              <span className="font-bold text-sm text-white/62">
                {(lead.contact?.name ?? 'C').charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-white/90">{lead.contact?.name ?? 'Cliente'}</p>
              {lead.contact?.phone && <p className="text-[11px] text-white/45">{lead.contact.phone}</p>}
            </div>
          </div>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto py-3 px-[3%] space-y-0.5 wa-chat-bg">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full" style={{ color: 'rgba(26,32,53,0.38)' }}>
                <MessageSquare size={26} className="mb-2 opacity-40" />
                <p className="text-xs">Sin mensajes aún</p>
              </div>
            ) : messages.filter((m: any) => m.content || m.media_url).map((m: any) => {
              const out = m.direction === 'out'
              const bubbleBg = out ? '#4361ee' : '#ffffff'
              const bubbleBorder = out ? 'rgba(67,97,238,0.30)' : 'rgba(26,32,53,0.10)'
              return (
                <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'} mb-0.5`}>
                  <div className="relative max-w-[80%]"
                    style={{ marginRight: out ? 8 : 0, marginLeft: out ? 0 : 8 }}>
                    {/* Bubble */}
                    <div className={out ? 'chat-bubble-out' : ''} style={{
                      backgroundColor: bubbleBg,
                      border: `1px solid ${bubbleBorder}`,
                      borderRadius: out ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      padding: '6px 10px 8px 10px',
                      boxShadow: out ? '0 1px 3px rgba(67,97,238,0.20)' : '0 1px 3px rgba(0,0,0,0.06)',
                      position: 'relative', zIndex: 1,
                      color: out ? '#ffffff' : 'var(--text)',
                    }}>
                      <ChatMsgContent m={m} />
                      <div className="flex items-center justify-end gap-1 mt-1" style={{ minHeight: 14 }}>
                        <span style={{ color: out ? 'rgba(255,255,255,0.70)' : 'rgba(26,32,53,0.40)', fontSize: 11, whiteSpace: 'nowrap' }}>
                          {format(parseAsUTC(m.created_at), 'HH:mm', { locale: es })}
                        </span>
                        {out && <WaTicksChat status={m.status} />}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={endRef} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Dark Audio Player ─────────────────────────────────────
function DarkAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause() } else { a.play() }
    setPlaying(!playing)
  }

  const fmtTime = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return '0:00'
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current
    if (!a || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    a.currentTime = ratio * duration
  }

  return (
    <div className="flex items-center gap-2.5 py-1" style={{ minWidth: 200, maxWidth: 240 }}>
      <audio ref={audioRef} src={src}
        onTimeUpdate={e => {
          const a = e.currentTarget
          setCurrentTime(a.currentTime)
          setProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0)
        }}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0) }}
      />
      {/* Play/Pause */}
      <button onClick={toggle}
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
        style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.25)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)'}>
        {playing
          ? <Square size={12} fill="white" />
          : <svg width="12" height="12" viewBox="0 0 12 12" fill="white"><polygon points="2,1 11,6 2,11" /></svg>
        }
      </button>
      {/* Waveform / progress bar */}
      <div className="flex-1 flex flex-col gap-1">
        <div className="relative h-1.5 rounded-full cursor-pointer overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.15)' }}
          onClick={handleSeek}>
          <div className="absolute left-0 top-0 h-full rounded-full transition-all"
            style={{ width: `${progress}%`, background: 'rgba(255,255,255,0.75)' }} />
        </div>
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {playing || currentTime > 0 ? fmtTime(currentTime) : fmtTime(duration)}
        </span>
      </div>
      {/* Mic icon */}
      <Mic size={14} style={{ color: 'rgba(255,255,255,0.45)', flexShrink: 0 }} />
    </div>
  )
}

// Detecta URLs (http/https) en texto plano y las renderiza como <a>
// clickeables. Mantiene el resto del texto intacto (saltos de línea
// los preserva `whitespace-pre-wrap` del contenedor). Excluye signos
// de puntuación finales comunes (.,;:!?) del href.
const URL_REGEX = /(https?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]])/g
function renderLinkified(text: string, linkClass: string): React.ReactNode[] {
  if (!text) return []
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  URL_REGEX.lastIndex = 0
  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    const href = match[0]
    parts.push(
      <a
        key={`url-${match.index}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        className={linkClass}
        onClick={(e) => e.stopPropagation()}
      >
        {href}
      </a>,
    )
    lastIndex = match.index + href.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function ChatMsgContent({ m }: { m: any }) {
  const type = m.message_type || 'text'
  const url = m.media_url || null
  if (!m.content && !url) return null
  if (url && (type === 'image' || /\.(jpg|jpeg|png|webp|gif)$/i.test(url))) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img src={url} alt="imagen" className="rounded-xl max-w-[220px] max-h-[220px] object-cover cursor-zoom-in" />
        {m.content && m.content !== '[Imagen]' && !/\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|ogg|mp3|m4a|aac|opus|pdf|doc|docx|xls|xlsx)$/i.test(m.content) && (
          <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap text-white/85">{m.content}</p>
        )}
      </a>
    )
  }
  if (url && (type === 'audio' || /\.(ogg|mp3|m4a|aac|opus|webm)$/i.test(url))) {
    return <DarkAudioPlayer src={url} />
  }
  if (url && (type === 'video' || /\.(mp4|webm|mov)$/i.test(url))) {
    return <video controls src={url} className="rounded-xl max-w-[220px] max-h-[180px]" />
  }
  if (url && type === 'document') {
    const fname = url.split('/').pop() || 'archivo'
    return (
      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm underline underline-offset-2 text-white/78">
        <FileText size={13} className="flex-shrink-0" />
        <span className="truncate max-w-[180px]">{m.content || fname}</span>
      </a>
    )
  }
  return (
    <p className="leading-relaxed whitespace-pre-wrap text-[13px] text-white/85" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
      {renderLinkified(m.content, 'underline underline-offset-2 text-sky-300 hover:text-sky-200')}
    </p>
  )
}

// Used in FillContactSplit (blue bg → white ticks)
const TICK_LABEL: Record<string, string> = { logged: 'Pendiente', sent: 'Enviado', delivered: 'Entregado', read: 'Leído', failed: 'Error' }
function WaTicksChat({ status }: { status: string }) {
  const label = TICK_LABEL[status] ?? 'Enviado'
  if (status === 'failed') return <span title={label} className="text-danger font-bold" style={{ fontSize: 13, lineHeight: 1 }}>!</span>
  if (status === 'logged') return <span title={label}><Clock size={13} color="rgba(255,255,255,0.55)" /></span>
  if (status === 'read') return <span title={label}><CheckCheck size={16} color="#53bdeb" strokeWidth={2.5} /></span>
  if (status === 'delivered') return <span title={label}><CheckCheck size={16} color="rgba(255,255,255,0.75)" strokeWidth={2.5} /></span>
  return <span title={label}><Check size={16} color="rgba(255,255,255,0.75)" strokeWidth={2.5} /></span>
}

// Used in ChatTab (WA green/white bg → proper WA colors)
function WaTicks({ status }: { status: string }) {
  const label = TICK_LABEL[status] ?? 'Enviado'
  if (status === 'failed') return <span title={label} style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 13, lineHeight: 1 }}>!</span>
  if (status === 'logged') return <span title={label}><Clock size={13} color="#8696a0" /></span>
  if (status === 'read') return <span title={label}><CheckCheck size={16} color="#53bdeb" strokeWidth={2.5} /></span>
  if (status === 'delivered') return <span title={label}><CheckCheck size={16} color="#8696a0" strokeWidth={2.5} /></span>
  return <span title={label}><Check size={16} color="#8696a0" strokeWidth={2.5} /></span>
}

// Audio player for WhatsApp-style light bubbles
function WaAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    playing ? a.pause() : a.play()
    setPlaying(!playing)
  }
  const fmtTime = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return '0:00'
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  }
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current
    if (!a || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    a.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  return (
    <div className="flex items-center gap-2.5 py-1" style={{ minWidth: 200, maxWidth: 240 }}>
      <audio ref={audioRef} src={src}
        onTimeUpdate={e => {
          const a = e.currentTarget
          setCurrentTime(a.currentTime)
          setProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0)
        }}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0) }}
      />
      <button onClick={toggle}
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: '#25d366', color: '#fff' }}>
        {playing
          ? <Square size={12} fill="white" />
          : <svg width="12" height="12" viewBox="0 0 12 12" fill="white"><polygon points="2,1 11,6 2,11" /></svg>
        }
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className="relative h-1.5 rounded-full cursor-pointer overflow-hidden"
          style={{ background: 'rgba(17,27,33,0.15)' }} onClick={handleSeek}>
          <div className="absolute left-0 top-0 h-full rounded-full"
            style={{ width: `${progress}%`, background: '#25d366' }} />
        </div>
        <span style={{ fontSize: 10, color: 'rgba(17,27,33,0.5)' }}>
          {playing || currentTime > 0 ? fmtTime(currentTime) : fmtTime(duration)}
        </span>
      </div>
      <Mic size={14} style={{ color: 'rgba(17,27,33,0.4)', flexShrink: 0 }} />
    </div>
  )
}

// Message content for WA-style light bubbles (dark text)
function WaChatMsgContent({ m }: { m: any }) {
  const type = m.message_type || 'text'
  const url = m.media_url || null
  if (!m.content && !url) return null
  if (url && (type === 'image' || /\.(jpg|jpeg|png|webp|gif)$/i.test(url))) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img src={url} alt="imagen" className="rounded-xl max-w-[220px] max-h-[220px] object-cover cursor-zoom-in" />
        {m.content && m.content !== '[Imagen]' && !/\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|ogg|mp3|m4a|aac|opus|pdf|doc|docx|xls|xlsx)$/i.test(m.content) && (
          <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: '#111b21' }}>{m.content}</p>
        )}
      </a>
    )
  }
  if (url && (type === 'audio' || /\.(ogg|mp3|m4a|aac|opus|webm)$/i.test(url))) {
    return <WaAudioPlayer src={url} />
  }
  if (url && (type === 'video' || /\.(mp4|webm|mov)$/i.test(url))) {
    return <video controls src={url} className="rounded-xl max-w-[220px] max-h-[180px]" />
  }
  if (url && type === 'document') {
    const fname = url.split('/').pop() || 'archivo'
    return (
      <a href={url} target="_blank" rel="noreferrer"
        className="flex items-center gap-2 text-sm underline underline-offset-2"
        style={{ color: '#111b21' }}>
        <FileText size={13} className="flex-shrink-0" />
        <span className="truncate max-w-[180px]">{m.content || fname}</span>
      </a>
    )
  }
  return (
    <p className="leading-relaxed whitespace-pre-wrap text-[13px]"
      style={{ color: '#111b21', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
      {renderLinkified(m.content, 'underline underline-offset-2 text-[#027eb5] hover:text-[#015d87]')}
    </p>
  )
}

function formatRecSecs(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

function ChatTab({ lead, configs, onLeadUpdate, onClearUnread }: { lead: Lead; configs: any[]; onLeadUpdate: (l: Lead) => void; onClearUnread?: (contactId: number) => void }) {
  const [messages, setMessages] = useState<any[]>([])
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  const [showFill, setShowFill] = useState(false)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordSecs, setRecordSecs] = useState(0)
  const [micBusy, setMicBusy] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; msg: any } | null>(null)
  const [editingMsg, setEditingMsg] = useState<any | null>(null)
  const [editText, setEditText] = useState('')
  const [loadingMsgs, setLoadingMsgs] = useState(true)
  const [selectedConfigId, setSelectedConfigId] = useState<string>('')
  const [agentInfo, setAgentInfo] = useState<{ agent: { id: number; name: string } | null; state: string | null } | null>(null)

  const endRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sseRef = useRef<EventSource | null>(null)
  const sseReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Phone configs for this area (many-to-many junction table, most reliable source)
  const areaConfigs: any[] = (lead.area?.phone_configs ?? []).filter((c: any) => c.is_active !== false)

  // Auto-select when lead/area changes
  useEffect(() => {
    const first = areaConfigs[0]?.id?.toString()
      ?? (lead.area?.whatsapp_config_id != null ? lead.area.whatsapp_config_id.toString() : null)
      ?? configs.find((c: any) => c.group_id === lead.group_id)?.id?.toString()
      ?? configs[0]?.id?.toString()
      ?? ''
    setSelectedConfigId(first)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.area?.id])

  const activeConfig = areaConfigs.find((c: any) => c.id.toString() === selectedConfigId)
    ?? configs.find((c: any) => c.id.toString() === selectedConfigId)
    ?? areaConfigs[0]
    ?? configs.find((c: any) => c.id === lead.area?.whatsapp_config_id)
    ?? configs.find((c: any) => c.group_id === lead.group_id)
    ?? configs[0]
  const configId = activeConfig?.id?.toString() ?? ''

  const loadMessages = async () => {
    try {
      const data = await getWhatsAppMessages({ contact_id: lead.contact_id })
      setMessages(data.slice().reverse())
    } catch { /* silent */ }
    finally { setLoadingMsgs(false) }
  }

  useEffect(() => {
    setLoadingMsgs(true)
    loadMessages()
    markMessagesRead(lead.contact_id)
      .then(() => onClearUnread?.(lead.contact_id))
      .catch(() => { })

    const contactId = lead.contact_id

    const connectSSE = () => {
      const token = localStorage.getItem('token')
      if (!token) return
      if (sseRef.current) sseRef.current.close()
      if (sseReconnectRef.current) clearTimeout(sseReconnectRef.current)
      const url = apiUrl(`/api/whatsapp/stream?token=${encodeURIComponent(token)}`)
      const es = new EventSource(url)
      sseRef.current = es
      // Watchdog: reconnect + reload if no keepalive for 25s
      let wd: ReturnType<typeof setTimeout> | null = null
      const resetWd = () => {
        if (wd) clearTimeout(wd)
        wd = setTimeout(() => {
          es.close(); sseRef.current = null
          getWhatsAppMessages({ contact_id: contactId })
            .then(data => setMessages(data.slice().reverse())).catch(() => {})
          sseReconnectRef.current = setTimeout(connectSSE, 200)
        }, 25000)
      }
      resetWd()
      es.onmessage = (e) => {
        resetWd()
        let evt: any
        try { evt = JSON.parse(e.data) } catch { return }
        if (evt.type === 'new_message' && evt.message?.contact_id === contactId) {
          setMessages(prev => {
            if (prev.some((m: any) => m.id === evt.message.id)) return prev
            return [...prev, evt.message]
          })
        }
        if (evt.type === 'status_update') {
          setMessages(prev =>
            prev.map((m: any) => m.id === evt.db_id ? { ...m, status: evt.status } : m)
          )
        }
        if (evt.type === 'refresh') {
          getWhatsAppMessages({ contact_id: contactId })
            .then(data => setMessages(data.slice().reverse()))
            .catch(() => { })
        }
      }
      es.onerror = () => {
        if (wd) clearTimeout(wd)
        es.close()
        sseRef.current = null
        getWhatsAppMessages({ contact_id: contactId })
          .then(data => setMessages(data.slice().reverse()))
          .catch(() => { })
        sseReconnectRef.current = setTimeout(connectSSE, 1000)
      }
    }
    connectSSE()

    pollRef.current = setInterval(() => {
      getWhatsAppMessages({ contact_id: contactId })
        .then(data => setMessages(data.slice().reverse()))
        .catch(() => { })
    }, 8000)

    return () => {
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null }
      if (sseReconnectRef.current) clearTimeout(sseReconnectRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    }
  }, [lead.id])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Load agent state for this contact
  useEffect(() => {
    getContactAgentState(lead.contact_id).then(setAgentInfo).catch(() => { })
  }, [lead.contact_id])

  const handleAgentToggle = async () => {
    if (!agentInfo?.agent) return
    const newState = agentInfo.state === 'active' ? 'paused' : 'active'
    try {
      await setContactAgentState(agentInfo.agent.id, lead.contact_id, newState)
      setAgentInfo(prev => prev ? { ...prev, state: newState } : prev)
      toast.success(newState === 'active' ? 'Agente reactivado' : 'Tomaste el control del chat')
    } catch { toast.error('Error actualizando agente') }
  }

  const clearMedia = useCallback(() => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview)
    setMediaFile(null)
    setMediaPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [mediaPreview])

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
    if (micBusy) return
    setMicBusy(true)
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
    } catch {
      toast.error('Permite el acceso al micrófono en tu navegador')
    } finally {
      setMicBusy(false)
    }
  }

  const handleSend = async () => {
    if (!configId) { toast.error('Sin número WhatsApp configurado para este lead'); return }
    const hasMedia = !!mediaFile
    const hasText = !!msgText.trim()
    if (!hasMedia && !hasText) { toast.error('Escribe un mensaje o adjunta un archivo'); return }
    setSending(true)
    try {
      if (hasMedia) {
        const fd = new FormData()
        fd.append('file', mediaFile!)
        fd.append('contact_id', lead.contact_id.toString())
        fd.append('whatsapp_config_id', configId)
        fd.append('caption', msgText.trim())
        fd.append('lead_id', lead.id.toString())
        const mediaResult = await sendWhatsAppMedia(fd)
        if (mediaResult?.status === 'logged') toast.error('WhatsApp no conectado — archivo guardado sin enviar')
        clearMedia()
        setMsgText('')
      } else {
        const result = await sendWhatsAppMessage({ contact_id: lead.contact_id, whatsapp_config_id: parseInt(configId), message: msgText, lead_id: lead.id })
        if (result?.status === 'logged') toast.error('WhatsApp no conectado — mensaje guardado sin enviar')
        setMsgText('')
      }
      loadMessages()
    } catch { toast.error('Error enviando mensaje') }
    finally { setSending(false) }
  }

  const handleDeleteMsg = async (id: number) => {
    try {
      await deleteWhatsAppMessage(id)
      setMessages(prev => prev.filter(m => m.id !== id))
      setCtxMenu(null)
    } catch { toast.error('Error al eliminar') }
  }

  const handleEditMsg = async () => {
    if (!editingMsg || !editText.trim()) return
    try {
      const updated = await editWhatsAppMessage(editingMsg.id, editText)
      setMessages(prev => prev.map(m => m.id === updated.id ? updated : m))
      setEditingMsg(null); setEditText('')
    } catch { toast.error('Error al editar') }
  }

  const handleFillSave = async (contactData: any, leadData: any) => {
    const updatedContact = await updateContact(lead.contact_id, contactData)
    const payload: Record<string, any> = {}
    if (leadData.honorarios !== '') payload.honorarios = parseFloat(leadData.honorarios) || 0
    if (leadData.cuota_inicial !== '') payload.cuota_inicial = parseFloat(leadData.cuota_inicial) || 0
    if (leadData.num_cuotas !== '') payload.num_cuotas = parseInt(leadData.num_cuotas) || 1
    if (leadData.monto_cuota !== '') payload.monto_cuota = parseFloat(leadData.monto_cuota) || 0
    if (leadData.service_description !== '') payload.service_description = leadData.service_description || null
    if (leadData.notes !== '') payload.notes = leadData.notes || null
    if (leadData.source) payload.source = leadData.source
    const updatedLead = Object.keys(payload).length > 0
      ? await updateLead(lead.id, payload)
      : lead
    onLeadUpdate({ ...updatedLead, contact: updatedContact })
    toast.success('Datos guardados')
  }

  const isImage = mediaFile?.type.startsWith('image/')
  const isAudio = mediaFile?.type.startsWith('audio/')

  return (
    <div className="flex flex-col h-full">
      {/* Chat sub-header */}
      <div className="px-4 py-2 bg-surface-0 border-b border-white/[0.07] flex items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {activeConfig ? (
            areaConfigs.length > 1 ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-lime flex-shrink-0" />
                <select
                  value={selectedConfigId}
                  onChange={e => setSelectedConfigId(e.target.value)}
                  className="text-[11px] font-medium text-white/70 bg-surface-1 border border-white/10 rounded-md px-2 py-1 outline-none cursor-pointer"
                >
                  {areaConfigs.map((c: any) => (
                    <option key={c.id} value={c.id.toString()}>{c.phone_number}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-lime flex-shrink-0" />
                <span className="text-[11px] font-medium text-white/70 truncate max-w-[120px]">{activeConfig.phone_number}</span>
              </div>
            )
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-warn flex-shrink-0" />
              <span className="text-[11px] text-warn font-medium">Sin número configurado</span>
            </div>
          )}
        </div>
        {/* Agent badge + control */}
        {agentInfo?.agent && (
          <button
            onClick={handleAgentToggle}
            title={agentInfo.state === 'active' ? `Agente activo: ${agentInfo.agent.name}` : 'Agente pausado — tú tienes el control'}
            className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors flex-shrink-0 ${agentInfo.state === 'active'
                ? 'bg-lime/10 text-lime border-lime/25 hover:bg-danger/10 hover:text-danger hover:border-danger/25'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/25 hover:bg-lime/10 hover:text-lime hover:border-lime/25'
              }`}
          >
            <Bot size={11} />
            {agentInfo.state === 'active' ? 'IA activa' : 'Tú tienes control'}
          </button>
        )}
        <button
          onClick={() => setShowFill(true)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-white/62 bg-surface-1 border border-white/10 hover:border-white/20 hover:bg-surface-2 px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
        >
          <Clipboard size={11} /> Rellenar datos
        </button>
      </div>

      {/* Messages — WhatsApp background */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 flex flex-col wa-chat-bg">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center" style={{ color: 'rgba(17,27,33,0.40)' }}>
            {loadingMsgs
              ? <div className="w-5 h-5 border-2 rounded-full animate-spin mb-2" style={{ borderColor: 'rgba(17,27,33,0.12)', borderTopColor: '#25d366' }} />
              : <MessageSquare size={26} className="mb-2 opacity-40" />
            }
            <p className="text-xs">{loadingMsgs ? 'Cargando mensajes...' : 'Sin mensajes aún'}</p>
          </div>
        ) : (
          <>
            <div className="flex-1" />
            <div className="py-3 px-3">
              {(() => {
                const items: React.ReactNode[] = []
                let lastDateStr = ''
                messages.filter((m: any) => m.content || m.media_url).forEach((m: any) => {
                  const d = parseAsUTC(m.created_at)
                  const dateStr = format(d, 'yyyy-MM-dd')
                  if (dateStr !== lastDateStr) {
                    lastDateStr = dateStr
                    const label = isToday(d) ? 'Hoy'
                      : isYesterday(d) ? 'Ayer'
                        : format(d, "d 'de' MMMM yyyy", { locale: es })
                    items.push(
                      <div key={`sep-${dateStr}`} className="flex items-center justify-center my-3">
                        <span className="text-[11px] font-medium px-3 py-1 rounded-full"
                          style={{ background: '#ffffff', color: 'rgba(17,27,33,0.6)', boxShadow: '0 1px 0.5px rgba(11,20,26,0.13)' }}>
                          {label}
                        </span>
                      </div>
                    )
                  }
                  const out = m.direction === 'out'
                  const WA_OUT = '#d9fdd3'
                  const WA_IN = '#ffffff'
                  items.push(
                    <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'} mb-[3px] group`}>
                      <div className={`relative max-w-[78%] ${out ? 'wa-bubble-out-wrap' : 'wa-bubble-in-wrap'}`}
                        style={{ marginRight: out ? 10 : 0, marginLeft: out ? 0 : 10 }}>
                        <div
                          onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, msg: m }) }}
                          style={{
                            backgroundColor: out ? WA_OUT : WA_IN,
                            borderRadius: out ? '7.5px 0px 7.5px 7.5px' : '0px 7.5px 7.5px 7.5px',
                            padding: '6px 10px 5px 10px',
                            boxShadow: '0 1px 0.5px rgba(11,20,26,0.13)',
                            position: 'relative', zIndex: 1, cursor: 'default',
                          }}>
                          <WaChatMsgContent m={m} />
                          <div className="flex items-center justify-end gap-1" style={{ minHeight: 15, marginTop: 2 }}>
                            <span style={{ color: 'rgba(17,27,33,0.5)', fontSize: 11, whiteSpace: 'nowrap' }}>
                              {format(parseAsUTC(m.created_at), 'HH:mm', { locale: es })}
                            </span>
                            {out && <WaTicks status={m.status} />}
                          </div>
                        </div>
                        <button
                          onClick={e => setCtxMenu({ x: e.clientX, y: e.clientY, msg: m })}
                          className="absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0.5"
                          style={{ ...(out ? { left: -20 } : { right: -20 }), background: out ? WA_OUT : WA_IN, fontSize: 12, color: 'rgba(17,27,33,0.45)' }}>
                          ▾
                        </button>
                      </div>
                    </div>
                  )
                })
                return items
              })()}
              <div ref={endRef} />
            </div>
          </>
        )}
      </div>

      {/* Media preview */}
      {(mediaFile || isRecording) && (
        <div className="px-4 py-2 flex items-center gap-3 flex-shrink-0" style={{ borderTop: '1px solid #e9edef', backgroundColor: '#f0f2f5' }}>
          {isRecording ? (
            <>
              <span className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: '#ef4444' }} />
              <span className="text-sm font-semibold" style={{ color: '#ef4444' }}>{formatRecSecs(recordSecs)}</span>
              <span className="text-xs" style={{ color: '#54656f' }}>Grabando...</span>
            </>
          ) : isImage && mediaPreview ? (
            <>
              <img src={mediaPreview} alt="preview" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
              <span className="text-xs truncate flex-1" style={{ color: '#54656f' }}>{mediaFile!.name}</span>
            </>
          ) : isAudio ? (
            <>
              <Mic size={16} style={{ color: '#54656f', flexShrink: 0 }} />
              <audio controls src={mediaPreview!} className="h-8 flex-1" />
            </>
          ) : (
            <>
              <FileText size={16} style={{ color: '#54656f', flexShrink: 0 }} />
              <span className="text-xs truncate flex-1" style={{ color: '#54656f' }}>{mediaFile!.name}</span>
            </>
          )}
          {!isRecording && (
            <button onClick={clearMedia}
              className="p-1 rounded-full flex-shrink-0 transition-colors"
              style={{ color: '#54656f' }}>
              <XIcon size={13} />
            </button>
          )}
        </div>
      )}

      {/* Input bar — WhatsApp style */}
      <div className="flex items-end gap-2 px-2 py-2 flex-shrink-0" style={{ backgroundColor: '#f0f2f5', borderTop: '1px solid #e9edef' }}>
        <input ref={fileInputRef} type="file"
          accept="image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
          className="hidden" onChange={handleFileSelect} />

        {/* Attach */}
        <button onClick={() => fileInputRef.current?.click()}
          disabled={!configId || isRecording}
          title="Adjuntar"
          className="p-2 rounded-full transition-colors flex-shrink-0 disabled:opacity-30"
          style={{ color: '#54656f' }}>
          <Paperclip size={22} />
        </button>

        {/* Textarea */}
        <textarea
          className="flex-1 resize-none text-sm outline-none rounded-xl px-4 py-2.5"
          style={{
            minHeight: 42,
            maxHeight: 100,
            lineHeight: '1.5',
            backgroundColor: '#ffffff',
            border: 'none',
            color: '#111b21',
          }}
          rows={1}
          disabled={!configId}
          value={msgText}
          onChange={e => {
            setMsgText(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
          }}
          placeholder={mediaFile ? 'Pie de foto (opcional)...' : configId ? 'Escribe un mensaje...' : 'Sin configuración WhatsApp'}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
        />

        {/* Mic / Send */}
        {msgText.trim() || mediaFile ? (
          <button onClick={handleSend}
            disabled={sending || isRecording || !configId}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-30 transition-opacity"
            style={{ backgroundColor: '#00a884', color: '#ffffff' }}>
            {sending ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        ) : (
          <button onClick={toggleRecording}
            disabled={!configId || micBusy}
            title={isRecording ? 'Detener grabación' : 'Grabar audio'}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-30 transition-colors"
            style={{
              backgroundColor: isRecording ? '#ef4444' : '#00a884',
              color: '#ffffff',
            }}>
            {isRecording ? <Square size={18} /> : <Mic size={18} />}
          </button>
        )}
      </div>

      {showFill && (
        <FillContactSplit
          messages={messages}
          lead={lead}
          onSave={handleFillSave}
          onClose={() => setShowFill(false)}
        />
      )}

      {/* Context menu */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
          <div className="fixed z-50 rounded-xl shadow-2xl overflow-hidden bg-surface-1 border border-white/10"
            style={{ top: ctxMenu.y, left: ctxMenu.x, minWidth: 160 }}>
            {ctxMenu.msg.direction === 'out' && ctxMenu.msg.message_type === 'text' && (
              <button
                onClick={() => { setEditingMsg(ctxMenu.msg); setEditText(ctxMenu.msg.content); setCtxMenu(null) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-surface-2 transition-colors text-white/85">
                <Pencil size={14} className="text-white/45" /> Editar mensaje
              </button>
            )}
            <button
              onClick={() => handleDeleteMsg(ctxMenu.msg.id)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-danger/10 transition-colors text-danger">
              <Trash2 size={14} className="text-danger" /> Eliminar mensaje
            </button>
          </div>
        </>
      )}

      {/* Edit modal */}
      {editingMsg && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end justify-center z-50 pb-6 px-4">
          <div className="bg-surface-1 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-white/[0.07]">
            <div className="px-5 py-3 border-b border-white/[0.07] flex items-center justify-between">
              <p className="font-semibold text-white/90 text-sm">Editar mensaje</p>
              <button onClick={() => setEditingMsg(null)} className="p-1 rounded-full hover:bg-surface-2 text-white/45">
                <XIcon size={15} />
              </button>
            </div>
            <div className="p-4">
              <textarea autoFocus
                className="w-full resize-none text-sm rounded-xl border border-white/10 bg-surface-0 text-white/90 px-3 py-2.5 outline-none focus:border-white/25"
                rows={3} value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditMsg() } }}
              />
            </div>
            <div className="px-4 pb-4 flex gap-2">
              <button onClick={() => setEditingMsg(null)}
                className="flex-1 py-2 rounded-xl border border-white/10 text-sm text-white/62 hover:bg-surface-2">
                Cancelar
              </button>
              <button onClick={handleEditMsg}
                className="flex-1 py-2 rounded-xl text-sm font-semibold btn-primary">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Info Tab ──────────────────────────────────────────────
function InfoTab({ lead, onUpdate, onOpenFull }: { lead: Lead; onUpdate: (l: Lead) => void; onOpenFull: () => void }) {

  const saveContact = async (field: string, raw: string) => {
    const val = raw.trim() || null
    const updated = await updateContact(lead.contact_id, { [field]: val })
    onUpdate({ ...lead, contact: updated })
  }

  const saveLead = async (field: string, raw: string) => {
    const numFields = ['honorarios', 'cuota_inicial', 'monto_cuota']
    const intFields = ['num_cuotas']
    let val: any = raw.trim() || null
    if (numFields.includes(field)) val = parseFloat(raw) || 0
    if (intFields.includes(field)) val = parseInt(raw) || 1

    const payload: Record<string, any> = { [field]: val }

    if (field === 'honorarios') {
      const nc = lead.num_cuotas || 1
      const ci = lead.cuota_inicial || 0
      if (nc > 1) {
        // Already has installments — keep cuota_inicial, recalc monto_cuota
        payload.monto_cuota = Math.round((val - ci) / nc)
      } else {
        // Single payment default: cuota_inicial = total
        payload.cuota_inicial = val
        payload.monto_cuota = 0
      }
    } else if (field === 'num_cuotas') {
      const h = lead.honorarios || 0
      const nc = val
      // If cuota_inicial equals honorarios it was auto-filled, not manually set — reset it
      const autoFilled = lead.cuota_inicial === lead.honorarios
      const ci = autoFilled ? 0 : (lead.cuota_inicial || 0)
      if (autoFilled) payload.cuota_inicial = 0
      payload.monto_cuota = h > 0 && nc > 0 ? Math.round((h - ci) / nc) : 0
    } else if (field === 'cuota_inicial') {
      // Manual change: recalculate monto_cuota
      const h = lead.honorarios || 0
      const nc = lead.num_cuotas || 1
      payload.monto_cuota = h > 0 && nc > 0 ? Math.round((h - val) / nc) : 0
    }

    const updated = await updateLead(lead.id, payload)
    onUpdate(updated)
  }

  const source = lead.source ? lead.source.charAt(0).toUpperCase() + lead.source.slice(1) : null

  return (
    <div className="px-4 py-4 space-y-0">

      {/* Stage card */}
      <SectionHead>Pipeline</SectionHead>
      <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl mb-1 border border-white/[0.09] bg-surface-0">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STAGE_DOT[lead.current_stage] ?? 'bg-white/20'}`} />
        <span className={`badge border text-xs ${STAGE_COLORS[lead.current_stage] ?? 'bg-white/[0.07] text-white/62'}`}>
          {STAGE_LABELS[lead.current_stage] ?? lead.current_stage}
        </span>
        <span className="ml-auto text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.22)' }}>
          Exp. #{lead.id}
        </span>
      </div>

      {/* Contact section card */}
      <SectionHead>Contacto</SectionHead>
      <div className="rounded-xl border border-white/[0.09] bg-surface-0">
        <EditableRow label="Nombre" value={lead.contact?.name} onSave={v => saveContact('name', v)} placeholder="Nombre real del cliente" />
        <EditableRow label="Teléfono" value={lead.contact?.phone} onSave={v => saveContact('phone', v)} type="tel" placeholder="+56 9 1234 5678" />
        <EditableRow label="Correo" value={lead.contact?.email} onSave={v => saveContact('email', v)} type="email" placeholder="correo@email.com" />
        <EditableRow label="RUT" value={lead.contact?.rut_persona} onSave={v => saveContact('rut_persona', v)} placeholder="12.345.678-9" transform={rutOnChange} />
        <EditableRow label="RUT Emp." value={lead.contact?.rut_empresa} onSave={v => saveContact('rut_empresa', v)} placeholder="76.000.000-0" transform={rutOnChange} />
        <EditableRow label="Empresa" value={lead.contact?.razon_social} onSave={v => saveContact('razon_social', v)} placeholder="Razón social" />
        <EditableRow label="Domicilio" value={lead.contact?.address} onSave={v => saveContact('address', v)} placeholder="Av. Principal 123" />
        <EditableRow label="Comuna" value={lead.contact?.city} onSave={v => saveContact('city', v)} placeholder="Providencia" />
      </div>

      {/* Lead section card */}
      <SectionHead>Expediente</SectionHead>
      <div className="rounded-xl border border-white/[0.09] bg-surface-0">
        <DataRow label="Área" value={lead.area?.name} />
        <EditableSelectRow label="Prioridad" value={lead.priority} onSave={v => saveLead('priority', v)}
          options={[{ value: 'low', label: 'Baja' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'Alta' }]} />
        <DataRow label="Vendedor" value={lead.vendedor?.name} />
        <DataRow label="Agendador/a" value={lead.agendadora?.name} />
        <EditableSelectRow label="Fuente" value={lead.source} onSave={v => saveLead('source', v)}
          options={[
            { value: 'whatsapp', label: 'WhatsApp' }, { value: 'referido', label: 'Referido' },
            { value: 'facebook', label: 'Facebook' }, { value: 'instagram', label: 'Instagram' },
            { value: 'web', label: 'Sitio Web' }, { value: 'otro', label: 'Otro' },
          ]} />
        <DataRow label="Creado" value={format(new Date(lead.created_at), "d MMM yyyy", { locale: es })} />
      </div>

      {/* Honorarios section card */}
      <SectionHead>Honorarios</SectionHead>
      <div className="rounded-xl border border-white/[0.09] bg-surface-0">
        <EditableRow label="Total" value={lead.honorarios || ''} onSave={v => saveLead('honorarios', v)} type="number" placeholder="1200000" isMoney />
        <EditableRow label="N° Cuotas" value={lead.num_cuotas} onSave={v => saveLead('num_cuotas', v)} type="number" placeholder="1" />
        <EditableRow label="Cuota inicial" value={lead.cuota_inicial || ''} onSave={v => saveLead('cuota_inicial', v)} type="number" placeholder="200000" isMoney />
        <EditableRow label="Monto cuota" value={lead.monto_cuota || ''} onSave={v => saveLead('monto_cuota', v)} type="number" placeholder="200000" isMoney />
      </div>

      {/* Description + Notes */}
      <SectionHead>Descripción y Notas</SectionHead>
      <div className="rounded-xl border border-white/[0.09] bg-surface-0">
        <EditableRow label="Descripción" value={lead.service_description} onSave={v => saveLead('service_description', v)} placeholder="Ej: Liquidación concursal..." />
        <EditableRow label="Notas internas" value={lead.notes} onSave={v => saveLead('notes', v)} placeholder="Ej: Cliente difícil, llamar tarde..." />
      </div>

      {/* Integraciones externas */}
      {(lead.pagacuotas_status || lead.legal_finance_contrato_id) && (
        <>
          <SectionHead>Sistemas externos</SectionHead>
          <div className="rounded-xl border border-white/[0.09] bg-surface-0 divide-y divide-white/[0.07]">
            {lead.pagacuotas_status && (
              <div className="flex items-center px-3.5 py-2.5">
                <span className="w-28 flex-shrink-0 text-xs text-white/52 font-semibold">PagaCuotas</span>
                <div className="flex items-center gap-2">
                  {lead.pagacuotas_status === 'created' && (
                    <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
                      ✓ Cuenta creada
                    </span>
                  )}
                  {lead.pagacuotas_status === 'failed' && (
                    <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                      ✗ Error al crear
                    </span>
                  )}
                  {lead.pagacuotas_cliente_id && lead.pagacuotas_cliente_id !== 'creado' && (
                    <span className="text-[10px] text-white/45 font-mono">ID: {lead.pagacuotas_cliente_id}</span>
                  )}
                </div>
              </div>
            )}
            {lead.legal_finance_contrato_id && (
              <div className="flex items-center px-3.5 py-2.5">
                <span className="w-28 flex-shrink-0 text-xs text-white/52 font-semibold">Legal Finance</span>
                <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
                  ✓ Contrato #{lead.legal_finance_contrato_id}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      <div className="pt-4 pb-1">
        <button onClick={onOpenFull}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl transition-all"
          style={{ color: 'var(--primary)', background: 'rgba(67,97,238,0.10)', border: '1px solid rgba(67,97,238,0.20)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(67,97,238,0.18)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(67,97,238,0.10)' }}>
          Ver ficha completa →
        </button>
      </div>
    </div>
  )
}

// ── Historial Tab ─────────────────────────────────────────
function HistorialTab({ lead, leadId }: { lead: Lead; leadId: number }) {
  const [history, setHistory] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getLeadHistory(leadId),
      getWhatsAppMessages({ lead_id: leadId }),
    ]).then(([h, m]) => { setHistory(h); setMessages(m) })
      .catch(() => { })
      .finally(() => setLoading(false))
  }, [leadId])

  if (loading) return (
    <div className="flex justify-center py-10">
      <div className="w-5 h-5 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const fmt = (n: number) => n > 0 ? `$${Math.round(n).toLocaleString('es-CL')}` : '—'
  const daysIn = Math.max(0, Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000))
  const msgIn = messages.filter(m => m.direction === 'in').length
  const msgOut = messages.filter(m => m.direction === 'out').length
  // messages come desc from API, so [0] is newest
  const lastMsg = messages[0] ?? null
  const pv = (lead as any).payment_verification

  const RESULT_COLOR: Record<string, { bg: string; text: string; dot: string }> = {
    success: { bg: 'rgba(163,230,53,0.12)', text: '#a3e635', dot: '#a3e635' },
    failed: { bg: 'rgba(239,68,68,0.12)', text: '#ef4444', dot: '#ef4444' },
    pending: { bg: 'rgba(234,179,8,0.12)', text: '#eab308', dot: '#eab308' },
    manual: { bg: 'rgba(139,92,246,0.12)', text: '#a78bfa', dot: '#a78bfa' },
  }
  const RESULT_LABEL: Record<string, string> = {
    success: 'Éxito', failed: 'Falló', pending: 'Pendiente', manual: 'Manual',
  }

  const PV_COLOR: Record<string, string> = {
    pending: '#eab308', confirmed: '#a3e635', rejected: '#ef4444',
  }
  const PV_LABEL: Record<string, string> = {
    pending: 'Pendiente verificación', confirmed: 'Pago confirmado', rejected: 'Rechazado',
  }

  return (
    <div className="overflow-y-auto h-full">
      {/* ── KPI cards ─────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 grid grid-cols-2 gap-2.5">
        {/* Días en cartera */}
        <div className="rounded-xl border border-white/[0.07] bg-surface-0 px-4 py-3">
          <p className="text-[10px] font-semibold text-white/38 uppercase tracking-wide mb-1">Días en cartera</p>
          <p className="text-2xl font-bold text-white/90">{daysIn}</p>
          <p className="text-[11px] text-white/38 mt-0.5">
            desde {format(new Date(lead.created_at), "d MMM yyyy", { locale: es })}
          </p>
        </div>

        {/* Mensajes WhatsApp */}
        <div className="rounded-xl border border-white/[0.07] bg-surface-0 px-4 py-3">
          <p className="text-[10px] font-semibold text-white/38 uppercase tracking-wide mb-1">WhatsApp</p>
          <p className="text-2xl font-bold text-white/90">{msgIn + msgOut}</p>
          <p className="text-[11px] text-white/38 mt-0.5">
            {msgIn} recibidos · {msgOut} enviados
          </p>
        </div>

        {/* Honorarios */}
        <div className="rounded-xl border border-white/[0.07] bg-surface-0 px-4 py-3">
          <p className="text-[10px] font-semibold text-white/38 uppercase tracking-wide mb-1">Honorarios</p>
          <p className="text-lg font-bold text-lime leading-tight">{fmt(lead.honorarios)}</p>
          {lead.num_cuotas > 1 && (
            <p className="text-[11px] text-white/38 mt-0.5">
              {lead.num_cuotas} cuotas de {fmt(lead.monto_cuota)}
            </p>
          )}
          {lead.num_cuotas === 1 && <p className="text-[11px] text-white/38 mt-0.5">Pago único</p>}
        </div>

        {/* Último contacto / Pago */}
        <div className="rounded-xl border border-white/[0.07] bg-surface-0 px-4 py-3">
          <p className="text-[10px] font-semibold text-white/38 uppercase tracking-wide mb-1">
            {pv ? 'Pago' : 'Último contacto'}
          </p>
          {pv ? (
            <>
              <p className="text-sm font-bold" style={{ color: PV_COLOR[pv.status] ?? 'var(--text-2)' }}>
                {PV_LABEL[pv.status] ?? pv.status}
              </p>
              {pv.payment_amount && <p className="text-[11px] text-white/38 mt-0.5">{fmt(pv.payment_amount)}</p>}
            </>
          ) : lastMsg ? (
            <>
              <p className="text-sm font-bold text-white/90">
                {format(new Date(lastMsg.created_at), "d MMM", { locale: es })}
              </p>
              <p className="text-[11px] text-white/38 mt-0.5 truncate">
                {lastMsg.direction === 'out' ? 'Tú: ' : ''}{lastMsg.content}
              </p>
            </>
          ) : (
            <p className="text-sm text-white/38">Sin mensajes</p>
          )}
        </div>
      </div>

      {/* ── Responsables ──────────────────────────────────── */}
      <div className="px-4 pb-3">
        <div className="rounded-xl border border-white/[0.07] bg-surface-0 px-4 py-3 flex items-center gap-4 flex-wrap">
          {lead.agendadora && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-neon/15 flex items-center justify-center text-[10px] font-bold text-neon">
                {lead.agendadora.name.charAt(0)}
              </div>
              <div>
                <p className="text-[10px] text-white/38">Agendador/a</p>
                <p className="text-xs font-semibold text-white/78">{lead.agendadora.name}</p>
              </div>
            </div>
          )}
          {lead.vendedor && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/62">
                {lead.vendedor.name.charAt(0)}
              </div>
              <div>
                <p className="text-[10px] text-white/38">Vendedor</p>
                <p className="text-xs font-semibold text-white/78">{lead.vendedor.name}</p>
              </div>
            </div>
          )}
          {lead.source && (
            <div className="ml-auto">
              <p className="text-[10px] text-white/38">Fuente</p>
              <p className="text-xs font-semibold text-white/78 capitalize">{lead.source}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Línea de tiempo ───────────────────────────────── */}
      <div className="px-4 pb-5">
        <p className="text-[10px] font-bold text-white/38 uppercase tracking-widest mb-3">Recorrido del lead</p>

        {history.length === 0 ? (
          <p className="text-xs text-white/38 text-center py-4">Sin movimientos registrados</p>
        ) : (
          <div className="relative">
            <div className="absolute left-3.5 top-0 bottom-0 w-px bg-white/[0.07]" />
            <div className="space-y-3">
              {/* Creación */}
              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center z-10 text-white/45" style={{ fontSize: 12 }}>
                  ★
                </div>
                <div className="flex-1 pt-0.5 pb-1">
                  <p className="text-xs font-semibold text-white/78">Lead creado</p>
                  <p className="text-[11px] text-white/38">
                    {format(new Date(lead.created_at), "d MMM yyyy · HH:mm", { locale: es })}
                    {lead.agendadora ? ` · ${lead.agendadora.name}` : ''}
                  </p>
                </div>
              </div>

              {history.map((h, i) => {
                const rc = RESULT_COLOR[h.result] ?? { bg: 'rgba(255,255,255,0.07)', text: 'rgba(255,255,255,0.52)', dot: 'rgba(255,255,255,0.30)' }
                // Duration at the previous stage
                const prevTime = i === 0 ? new Date(lead.created_at) : new Date(history[i - 1].created_at)
                const thisTime = new Date(h.created_at)
                const durMins = Math.round((thisTime.getTime() - prevTime.getTime()) / 60000)
                const durLabel = durMins < 60
                  ? `${durMins}m`
                  : durMins < 1440
                    ? `${Math.round(durMins / 60)}h`
                    : `${Math.round(durMins / 1440)}d`

                return (
                  <div key={h.id} className="flex gap-3 items-start">
                    {/* Dot */}
                    <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center z-10 text-[10px] font-bold"
                      style={{ backgroundColor: rc.bg, color: rc.text }}>
                      {h.result === 'success' ? '✓' : h.result === 'failed' ? '✕' : h.result === 'manual' ? '↕' : '…'}
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      {/* Stage path */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {h.from_stage && (
                          <>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STAGE_COLORS[h.from_stage] ?? 'bg-white/[0.07] text-white/45'}`}>
                              {STAGE_LABELS[h.from_stage] ?? h.from_stage}
                            </span>
                            <span className="text-white/25 text-[10px]">→</span>
                          </>
                        )}
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STAGE_COLORS[h.to_stage] ?? 'bg-white/[0.07] text-white/45'}`}>
                          {STAGE_LABELS[h.to_stage] ?? h.to_stage}
                        </span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: rc.bg, color: rc.text }}>
                          {RESULT_LABEL[h.result] ?? h.result ?? ''}
                        </span>
                        <span className="text-[10px] text-white/25 ml-1">({durLabel})</span>
                      </div>
                      {h.notes && h.notes !== 'a' && (
                        <p className="text-[11px] text-white/52 bg-white/[0.04] rounded-lg px-2.5 py-1.5 mb-1 leading-relaxed border border-white/[0.06]">
                          {h.notes}
                        </p>
                      )}
                      <p className="text-[10px] text-white/38">
                        {h.creator?.name} · {format(new Date(h.created_at), "d MMM yy · HH:mm", { locale: es })}
                      </p>
                    </div>
                  </div>
                )
              })}

              {/* Current stage indicator */}
              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center z-10 bg-neon/10 border-2 border-neon/40">
                  <div className="w-2 h-2 rounded-full bg-neon animate-pulse" />
                </div>
                <div className="flex-1 pt-0.5">
                  <p className="text-xs font-semibold text-neon/80">Etapa actual</p>
                  <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 ${STAGE_COLORS[lead.current_stage] ?? 'bg-white/[0.07] text-white/45'}`}>
                    {STAGE_LABELS[lead.current_stage] ?? lead.current_stage}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Notas Tab ─────────────────────────────────────────────
function NotasTab({ lead, onSaved }: { lead: Lead; onSaved: (l: Lead) => void }) {
  const [notes, setNotes] = useState(lead.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => { setNotes(lead.notes ?? ''); setDirty(false) }, [lead.id])

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await updateLead(lead.id, { notes })
      onSaved(updated)
      setDirty(false)
      toast.success('Notas guardadas')
    } catch { toast.error('Error al guardar') }
    finally { setSaving(false) }
  }

  return (
    <div className="px-5 py-4 flex flex-col gap-3 h-full">
      <textarea
        className="flex-1 resize-none text-sm px-3.5 py-3 border border-white/10 bg-surface-0 text-white/90 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/15 focus:border-white/25 placeholder:text-white/25 transition-all leading-relaxed"
        style={{ minHeight: 180 }}
        value={notes}
        onChange={e => { setNotes(e.target.value); setDirty(true) }}
        placeholder="Escribe notas internas sobre este lead..."
      />
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving || !dirty}
          className="btn-primary text-xs py-2 px-4 disabled:opacity-40">
          {saving ? 'Guardando...' : 'Guardar notas'}
        </button>
      </div>
    </div>
  )
}

/* ── Agendar Tab ─────────────────────────────────────────── */
function AgendarTab({ lead, onClose, onLeadUpdated }: { lead: Lead; onClose?: () => void; onLeadUpdated?: (l: Lead) => void }) {
  const navigate = useNavigate()
  const [vendors, setVendors] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [vendorEvents, setVendorEvents] = useState<any[]>([])
  const [loadingCal, setLoadingCal] = useState(false)
  const [calWeekStart, setCalWeekStart] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - d.getDay() + 1) // Monday
    return d
  })
  const [form, setForm] = useState({
    title: `Reunión con ${lead.contact?.name ?? 'cliente'}`,
    start_time: '',
    end_time: '',
    event_type: 'reunion',
    notes: '',
    assigned_to: '',
    color: '#3B82F6',
  })

  useEffect(() => {
    getGroupVendors().then(vs => {
      setVendors(vs)
      if (vs.length) setForm(f => ({ ...f, assigned_to: vs[0].id.toString() }))
    }).catch(() => { })
  }, [])

  // Load vendor calendar when vendor changes
  useEffect(() => {
    if (!form.assigned_to) { setVendorEvents([]); return }
    setLoadingCal(true)
    getCalendarEvents({ user_id: parseInt(form.assigned_to) })
      .then(setVendorEvents)
      .catch(() => setVendorEvents([]))
      .finally(() => setLoadingCal(false))
  }, [form.assigned_to])

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const toUtcIso = (localStr: string): string => {
    if (!localStr) return localStr
    const d = new Date(localStr)
    return isNaN(d.getTime()) ? localStr : d.toISOString()
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.start_time || !form.end_time) { toast.error('Ingresa horario'); return }
    setSaving(true)
    try {
      await createCalendarEvent({
        title: form.title,
        lead_id: lead.id,
        contact_id: lead.contact_id,
        start_time: toUtcIso(form.start_time),
        end_time: toUtcIso(form.end_time),
        event_type: form.event_type,
        notes: form.notes,
        assigned_to: form.assigned_to ? parseInt(form.assigned_to) : null,
        color: form.color,
      })

      // Auto-advance to "reunion" stage when scheduling a reunion from lead/recuperacion_lead
      const ADVANCE_FROM = new Set(['lead', 'recuperacion_lead'])
      if (form.event_type === 'reunion' && ADVANCE_FROM.has(lead.current_stage)) {
        try {
          const updated = await moveLeadStage(lead.id, {
            stage: 'reunion',
            notes: 'Reunión agendada — avance automático de etapa',
          })
          onLeadUpdated?.(updated)
          toast.success('Reunión agendada · Lead movido a Reunión')
        } catch {
          toast.success('Reunión agendada')
          toast.error('No se pudo avanzar el pipeline — verifica permisos')
        }
      } else {
        toast.success('Reunión agendada')
      }

      navigate('/calendario')
    } catch { toast.error('Error al agendar') }
    finally { setSaving(false) }
  }

  const EVENT_TYPES = [
    { value: 'reunion', label: 'Reunión', color: '#3B82F6' },
    { value: 'llamada', label: 'Llamada', color: '#10B981' },
    { value: 'seguimiento', label: 'Seguimiento', color: '#F59E0B' },
  ]

  // ── Mini calendar helpers ──────────────────────────────
  const HOURS = Array.from({ length: 13 }, (_, i) => i + 8) // 8–20
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(calWeekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const eventsForSlot = (day: Date, hour: number) => {
    const dayStr = format(day, 'yyyy-MM-dd')
    return vendorEvents.filter(ev => {
      const start = new Date(ev.start_time)
      const end = new Date(ev.end_time)
      const evDay = format(start, 'yyyy-MM-dd')
      return evDay === dayStr && start.getHours() <= hour && end.getHours() > hour
    })
  }

  const prevWeek = () => {
    const d = new Date(calWeekStart)
    d.setDate(d.getDate() - 7)
    setCalWeekStart(d)
  }
  const nextWeek = () => {
    const d = new Date(calWeekStart)
    d.setDate(d.getDate() + 7)
    setCalWeekStart(d)
  }

  const clickSlot = (day: Date, hour: number) => {
    const start = new Date(day)
    start.setHours(hour, 0, 0, 0)
    const end = new Date(start)
    end.setHours(hour + 1, 0, 0, 0)
    const fmt2 = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm")
    set('start_time', fmt2(start))
    set('end_time', fmt2(end))
    toast.success(`Horario seleccionado: ${format(start, "d MMM HH:mm", { locale: es })}`)
  }

  const selectedVendor = vendors.find(v => v.id.toString() === form.assigned_to)

  return (
    <form onSubmit={handleSave} className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 py-4 space-y-4">

        {/* Client card */}
        <div className="flex items-center gap-2 p-3 bg-surface-0 rounded-xl border border-white/[0.07]">
          <div className="w-8 h-8 bg-surface-3 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white/78 font-bold text-sm">{lead.contact?.name?.charAt(0)}</span>
          </div>
          <div>
            <p className="font-semibold text-white/90 text-sm">{lead.contact?.name}</p>
            <p className="text-xs text-white/38">{lead.contact?.phone} · {lead.area?.name}</p>
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="input-label">Título</label>
          <input className="input" value={form.title} onChange={e => set('title', e.target.value)} required />
        </div>

        {/* Vendor selector */}
        <div>
          <label className="input-label">Agendar para (abogado)</label>
          {vendors.length === 0 ? (
            <div className="input flex items-center gap-2 text-white/40 text-sm cursor-default">
              <span>Sin abogados asignados a este grupo</span>
            </div>
          ) : (
            <select className="input" value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
              <option value="">Solo en mi agenda</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          )}
        </div>

        {/* ── Vendor availability mini-calendar ── */}
        {form.assigned_to && (
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            {/* Cal header */}
            <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--primary)' }} />
                <p className="text-xs font-bold" style={{ color: 'var(--text)' }}>
                  Disponibilidad de {selectedVendor?.name?.split(' ')[0] ?? 'vendedor'}
                </p>
                {loadingCal && <div className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-2)', borderTopColor: 'var(--primary)' }} />}
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={prevWeek}
                  className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}>
                  ‹
                </button>
                <span className="text-[11px] font-medium px-1" style={{ color: 'var(--text-3)' }}>
                  {format(calWeekStart, "d MMM", { locale: es })} – {format(weekDays[6], "d MMM", { locale: es })}
                </span>
                <button type="button" onClick={nextWeek}
                  className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}>
                  ›
                </button>
              </div>
            </div>

            {/* Day headers */}
            <div className="grid" style={{ gridTemplateColumns: '36px repeat(7, 1fr)', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <div />
              {weekDays.map((d, i) => {
                const isToday_ = format(d, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                return (
                  <div key={i} className="py-1.5 text-center">
                    <p className="text-[9px] font-bold uppercase tracking-wide"
                      style={{ color: isToday_ ? 'var(--primary)' : 'var(--text-muted)' }}>
                      {format(d, 'EEE', { locale: es })}
                    </p>
                    <p className="text-[11px] font-bold"
                      style={{ color: isToday_ ? 'var(--primary)' : 'var(--text-2)' }}>
                      {format(d, 'd')}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* Time grid */}
            <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
              {HOURS.map(hour => (
                <div key={hour} className="grid" style={{ gridTemplateColumns: '36px repeat(7, 1fr)', minHeight: 28 }}>
                  {/* Hour label */}
                  <div className="flex items-start justify-end pr-2 pt-0.5">
                    <span className="text-[9px] font-medium" style={{ color: 'var(--text-muted)' }}>
                      {hour}:00
                    </span>
                  </div>
                  {/* Day cells */}
                  {weekDays.map((day, di) => {
                    const slotEvs = eventsForSlot(day, hour)
                    const hasEvent = slotEvs.length > 0
                    const isPast = new Date(day).setHours(hour + 1) < Date.now()
                    const isToday_ = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                    return (
                      <div key={di}
                        onClick={() => !hasEvent && !isPast && clickSlot(day, hour)}
                        className="relative border-l border-b transition-colors"
                        style={{
                          borderColor: 'var(--border)',
                          background: hasEvent
                            ? 'rgba(67,97,238,0.08)'
                            : isPast
                              ? 'rgba(26,32,53,0.04)'
                              : isToday_
                                ? 'rgba(67,97,238,0.03)'
                                : 'transparent',
                          cursor: hasEvent || isPast ? 'default' : 'pointer',
                        }}
                        onMouseEnter={e => {
                          if (!hasEvent && !isPast)
                            (e.currentTarget as HTMLElement).style.background = 'rgba(67,97,238,0.06)'
                        }}
                        onMouseLeave={e => {
                          if (!hasEvent && !isPast)
                            (e.currentTarget as HTMLElement).style.background = isToday_ ? 'rgba(67,97,238,0.03)' : 'transparent'
                        }}>
                        {hasEvent && (
                          <div className="absolute inset-0.5 rounded flex items-center overflow-hidden px-0.5"
                            style={{ background: 'rgba(67,97,238,0.12)', border: '1px solid rgba(67,97,238,0.25)' }}>
                            <span className="text-[8px] font-bold truncate leading-none"
                              style={{ color: 'var(--primary)' }}>
                              {slotEvs[0].title}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 px-3 py-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(67,97,238,0.12)', border: '1px solid rgba(67,97,238,0.25)' }} />
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Ocupado</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(67,97,238,0.06)', border: '1px solid rgba(67,97,238,0.15)' }} />
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Clic para seleccionar</span>
              </div>
            </div>
          </div>
        )}

        {/* Date/time inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="input-label">Inicio *</label>
            <input type="datetime-local" className="input" value={form.start_time}
              onChange={e => set('start_time', e.target.value)} required />
          </div>
          <div>
            <label className="input-label">Fin *</label>
            <input type="datetime-local" className="input" value={form.end_time}
              onChange={e => set('end_time', e.target.value)} required />
          </div>
        </div>

        {/* Type */}
        <div>
          <label className="input-label">Tipo</label>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {EVENT_TYPES.map(t => (
              <button key={t.value} type="button"
                onClick={() => { set('event_type', t.value); set('color', t.color) }}
                className={`px-2 py-2 rounded-xl border text-xs font-medium transition-all ${form.event_type === t.value
                    ? 'border-lime/40 bg-lime/10 text-lime'
                    : 'border-white/10 text-white/52 hover:border-white/20'
                  }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="input-label">Notas y Detalles de la reunión</label>
          <div className="space-y-2">
            <textarea className="input" rows={4} value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Agrega links de Meet, instrucciones o detalles para el vendedor..." />
            {form.notes && (
              <div className="p-3 bg-surface-0 rounded-xl border border-white/[0.07]">
                <p className="text-[10px] font-bold text-white/38 uppercase tracking-widest mb-1">Previsualización de Links</p>
                <div className="text-xs text-white/62 break-words">
                  {form.notes.split(/(\s+)/).map((part, i) => {
                    if (part.match(/^https?:\/\/[^\s]+$/)) {
                      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-neon underline hover:text-neon/80 break-all">{part}</a>
                    }
                    return part
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary w-full">
          <CalendarPlus size={15} />
          {saving ? 'Agendando...' : 'Crear y ver en calendario'}
        </button>
      </div>
    </form>
  )
}

const PAGE_SIZE = 80

// ── Main ──────────────────────────────────────────────────
export default function Leads() {
  const { user } = useAuthStore()
  const [leads, setLeads] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [stageFilter, setStage] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [showModal, setModal] = useState(false)
  const [selected, setSelected] = useState<Lead | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'chat' | 'historial' | 'notas' | 'agendar'>('info')
  const [configs, setConfigs] = useState<any[]>([])
  const [detailLeadId, setDetailLeadId] = useState<number | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leadsSSERef = useRef<EventSource | null>(null)
  const leadsSSEReRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leadsPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loadRef = useRef<(p?: number) => Promise<void>>(async () => { })
  const selContactRef = useRef<number | null>(null)
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const canAdmin = !!(user?.role && ['superadmin', 'subadmin'].includes(user.role))
  const isAdmin = canAdmin
  const canMove = true
  const canConfirmPago = !!(user?.role && ['admin', 'superadmin', 'vendedor'].includes(user.role))
  const [moveTarget, setMoveTarget] = useState<string | null>(null)
  const [groups, setGroups] = useState<any[]>([])

  const buildParams = (p = page) => ({
    ...(stageFilter ? { stage: stageFilter } : {}),
    ...(search ? { search } : {}),
    ...(groupFilter ? { group_id: parseInt(groupFilter) } : {}),
    limit: PAGE_SIZE,
    offset: (p - 1) * PAGE_SIZE,
  })

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = buildParams(p)
      const [ld, cnt, cfg] = await Promise.all([
        getLeads(params),
        getLeadsCount(params),
        configs.length ? Promise.resolve(configs) : getAllWhatsAppConfigs(),
      ])
      setLeads(ld)
      setTotal(cnt.total)
      setPage(p)
      setPages(Math.max(1, Math.ceil(cnt.total / PAGE_SIZE)))
      if (!configs.length) setConfigs(cfg as any[])
    } catch { toast.error('Error cargando leads') }
    finally { setLoading(false) }
  }, [stageFilter, search, groupFilter])

  useEffect(() => { load(1) }, [stageFilter, search, groupFilter])

  useEffect(() => {
    if (isAdmin) getGroups().then(setGroups)
  }, [])

  // Keep refs in sync so the SSE closure always sees the latest values
  useEffect(() => { loadRef.current = load }, [load])
  useEffect(() => { selContactRef.current = selected?.contact_id ?? null }, [selected])

  // SSE: real-time lead list updates when WhatsApp messages arrive or history is synced
  useEffect(() => {
    const connect = () => {
      const token = localStorage.getItem('token')
      if (!token) return
      if (leadsSSERef.current) leadsSSERef.current.close()
      const es = new EventSource(apiUrl(`/api/whatsapp/stream?token=${encodeURIComponent(token)}`))
      leadsSSERef.current = es
      es.onmessage = (e) => {
        let evt: any
        try { evt = JSON.parse(e.data) } catch { return }

        // Full refresh triggered by history sync or manual broadcast
        if (evt.type === 'refresh') {
          loadRef.current(1)
          return
        }

        if (evt.type === 'new_message') {
          const cid = evt.contact_id as number
          let isNew = false
          let isActive = false

          setLeads(prev => {
            const exists = prev.some(l => l.contact_id === cid)
            if (!exists) {
              isNew = true
              return prev
            }
            if (selContactRef.current === cid) {
              isActive = true
              return prev
            }
            return prev.map(l =>
              l.contact_id === cid
                ? { ...l, unread_count: (l.unread_count ?? 0) + 1 }
                : l
            )
          })

          setTimeout(() => {
            if (isNew) {
              playNewLeadSound()
              // Wait a bit to ensure backend committed the new lead
              setTimeout(() => loadRef.current(1), 1200)
            } else if (!isActive) {
              playMessageSound()
            }
          }, 10)
        }
      }
      es.onerror = () => {
        es.close()
        leadsSSERef.current = null
        leadsSSEReRef.current = setTimeout(connect, 3000)
      }
    }
    connect()

    // Fallback safety poll every 30s — catches missed SSE events and keeps data fresh
    leadsPollRef.current = setInterval(() => {
      loadRef.current(1)
    }, 30000)

    return () => {
      if (leadsSSERef.current) { leadsSSERef.current.close(); leadsSSERef.current = null }
      if (leadsSSEReRef.current) clearTimeout(leadsSSEReRef.current)
      if (leadsPollRef.current) clearInterval(leadsPollRef.current)
    }
  }, [])

  // Auto-open lead panel when navigated from WhatsApp "Ver Lead" (via location.state)
  useEffect(() => {
    const openLeadId = (location.state as any)?.openLeadId
    if (!openLeadId) return
    const found = leads.find(l => l.id === openLeadId)
    if (found) {
      setSelected(found)
      setActiveTab('chat')
    } else {
      getLead(openLeadId).then(l => {
        if (l) { setSelected(l); setActiveTab('chat') }
      }).catch(() => { })
    }
  }, [location.state])

  // Auto-open chat when navigated from push notification (?chat=leadId)
  useEffect(() => {
    const chatId = searchParams.get('chat')
    if (!chatId) return
    const id = parseInt(chatId)
    if (isNaN(id)) return
    const found = leads.find(l => l.id === id)
    if (found) {
      setSelected(found)
      setActiveTab('chat')
    } else {
      getLead(id).then(l => {
        if (l) { setSelected(l); setActiveTab('chat') }
      }).catch(() => { })
    }
  }, [searchParams, leads])

  // Debounce search input → server search
  const handleSearchChange = (val: string) => {
    setSearchInput(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(val), 400)
  }

  // Group leads by contact — one row per client in the list
  const contactGroups = useMemo(() => {
    const map = new Map<number, Lead[]>()
    for (const lead of leads) {
      if (!map.has(lead.contact_id)) map.set(lead.contact_id, [])
      map.get(lead.contact_id)!.push(lead)
    }
    const groups = Array.from(map.values())
    // Leads con mensajes sin leer primero, luego sin interacción 3+ días, luego el resto
    return groups.sort((a, b) => {
      const aUnread = a.some(l => (l.unread_count ?? 0) > 0)
      const bUnread = b.some(l => (l.unread_count ?? 0) > 0)
      if (aUnread !== bUnread) return aUnread ? -1 : 1

      const getLastUpdate = (g: Lead[]) => {
        const d = g[0].updated_at ?? g[0].created_at
        return d ? new Date(d.endsWith('Z') || d.includes('+') ? d : d + 'Z').getTime() : 0
      }
      const aDays = Math.floor((Date.now() - getLastUpdate(a)) / 86400000)
      const bDays = Math.floor((Date.now() - getLastUpdate(b)) / 86400000)
      const aCold = aDays >= 3
      const bCold = bDays >= 3
      if (aCold !== bCold) return aCold ? -1 : 1
      // Entre fríos, el más abandonado primero
      if (aCold && bCold) return bDays - aDays

      return 0
    })
  }, [leads])

  // All leads for the currently selected contact (for the lead switcher)
  const selectedContactLeads = useMemo(
    () => selected ? leads.filter(l => l.contact_id === selected.contact_id) : [],
    [leads, selected]
  )

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    if (!confirm('¿Eliminar este lead?')) return
    try {
      await deleteLead(id)
      toast.success('Lead eliminado')
      if (selected?.id === id) setSelected(null)
      load(page)
    } catch { toast.error('Error al eliminar') }
  }

  const handleDeleteGroup = async (group: Lead[], e: React.MouseEvent) => {
    e.stopPropagation()
    const count = group.length
    const msg = count === 1
      ? '¿Eliminar este lead? Esta acción no se puede deshacer.'
      : `¿Eliminar este contacto y sus ${count} expedientes? Esta acción no se puede deshacer.`
    if (!confirm(msg)) return
    try {
      await Promise.all(group.map(l => deleteLead(l.id)))
      toast.success(count === 1 ? 'Lead eliminado' : `${count} leads eliminados`)
      if (selected && group.some(l => l.id === selected.id)) setSelected(null)
      load(page)
    } catch { toast.error('Error al eliminar') }
  }

  const handleSelect = (lead: Lead) => {
    if (selected?.id === lead.id) return
    // Keep same tab when switching between leads of same contact (e.g. area B)
    // Reset to 'info' only when switching to a different contact
    if (selected?.contact_id !== lead.contact_id) {
      setActiveTab('info')
    }
    setSelected(lead)
  }

  const handleLeadUpdated = (updated: Lead) => {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
    setSelected(updated)
  }

  const handleMove = async (stage: string) => {
    if (!selected) return
    try {
      const updated = await moveLeadStage(selected.id, { stage })
      handleLeadUpdated(updated)
      toast.success(`Movido a ${STAGE_LABELS[stage] ?? stage}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error al mover')
    }
    setMoveTarget(null)
  }

  const clearContactUnread = useCallback((contactId: number) => {
    setLeads(prev => prev.map(l =>
      l.contact_id === contactId ? { ...l, unread_count: 0 } : l
    ))
  }, [])

  const TABS = [
    { key: 'info', label: 'Info', icon: Info },
    { key: 'chat', label: 'Chat', icon: MessageSquare },
    { key: 'notas', label: 'Notas', icon: StickyNote },
    { key: 'agendar', label: 'Agendar', icon: CalendarPlus },
  ] as const

  const closeDrawer = () => { setSelected(null) }

  const hasMore = leads.length < total  // kept for reference

  return (
    <div className="flex flex-col h-full">

      {/* ══ PAGE HEADER ═══════════════════════════════════ */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-white">Leads</h1>
            {isAdmin && (
              <span className={`text-sm font-bold px-3 py-1 rounded-xl border-2 ${groupFilter
                  ? 'bg-white/10 text-white border-white/20'
                  : 'bg-warn/10 text-warn border-warn/30'
                }`}>
                {groupFilter
                  ? groups.find((g: any) => String(g.id) === groupFilter)?.name ?? 'Grupo'
                  : '⚠ Todos los grupos'}
              </span>
            )}
          </div>
          <p className="text-xs text-white/45 mt-0.5">{contactGroups.length} clientes · {total} expedientes en total</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ExportButton />
          <button onClick={() => setModal(true)}
            className="flex items-center gap-1.5 btn-primary text-sm px-3 sm:px-4 py-2 sm:py-2.5">
            <Plus size={15} /> <span className="hidden sm:inline">Nuevo Lead</span><span className="sm:hidden">Nuevo</span>
          </button>
        </div>
      </div>

      {/* ══ DESCRIPCIÓN ═══════════════════════════════════ */}
      <div className="flex items-start gap-3 rounded-xl px-4 py-3 mb-4 text-xs" style={{ background: 'rgba(67,97,238,0.07)', border: '1px solid rgba(67,97,238,0.16)', color: 'rgba(52,81,199,0.90)' }}>
        <Info size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'rgba(67,97,238,0.9)' }} />
        <p>Aquí están todos sus clientes. Haga clic en cualquier carta para abrir el expediente completo, donde podrá enviar mensajes, agregar notas, agendar reuniones y avanzar el caso.</p>
      </div>

      {/* ══ SEARCH & FILTERS ══════════════════════════════ */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/38 pointer-events-none" />
          <input
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-white/10 rounded-xl bg-surface-1 text-white/90 focus:outline-none focus:ring-2 focus:ring-white/15 focus:border-white/25 placeholder:text-white/30 transition-all"
            placeholder="Buscar por nombre, teléfono o RUT..."
            value={searchInput} onChange={e => handleSearchChange(e.target.value)} />
        </div>
        {/* Group filter — admins only */}
        {isAdmin && groups.length > 0 && (
          <select
            className="text-sm border border-white/10 rounded-xl px-3 py-2.5 bg-surface-1 text-white/78 focus:outline-none focus:ring-2 focus:ring-white/15 cursor-pointer min-w-[140px]"
            value={groupFilter} onChange={e => setGroupFilter(e.target.value)}>
            <option value="">Todos los grupos</option>
            {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <select
          className="hidden sm:block text-sm border border-white/10 rounded-xl px-3 py-2.5 bg-surface-1 text-white/78 focus:outline-none focus:ring-2 focus:ring-white/15 cursor-pointer min-w-[150px]"
          value={stageFilter} onChange={e => setStage(e.target.value)}>
          <option value="">Todas las etapas</option>
          {ALL_STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
        </select>
        {/* Mobile: compact stage filter */}
        <select
          className="sm:hidden text-xs border border-white/10 rounded-xl px-2 py-2.5 bg-surface-1 text-white/78 focus:outline-none cursor-pointer max-w-[110px]"
          value={stageFilter} onChange={e => setStage(e.target.value)}>
          <option value="">Todas</option>
          {ALL_STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
        </select>
        <button onClick={() => load(page)}
          className="w-10 h-10 flex items-center justify-center border border-white/10 rounded-xl bg-surface-1 text-white/38 hover:text-white/78 hover:bg-surface-0 transition-colors flex-shrink-0">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* ══ GRID VIEW ═════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto pb-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/20 bg-surface-1 rounded-2xl border border-white/[0.07]">
            <Search size={32} className="mb-3" />
            <p className="text-sm font-medium text-white/38">Sin resultados</p>
            <p className="text-xs mt-1">Prueba con otro filtro o búsqueda</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 px-1">
            {contactGroups.map(group => {
              const lead = group[0]
              const active = selected?.contact_id === lead.contact_id

              const STAGE_ACCENT: Record<string, { dot: string; badge: string; badgeText: string; border: string }> = {
                lead: { dot: '#94a3b8', badge: '#f1f5f9', badgeText: '#64748b', border: '#94a3b8' },
                reunion: { dot: '#f59e0b', badge: '#fffbeb', badgeText: '#d97706', border: '#f59e0b' },
                altamente_interesado: { dot: '#f59e0b', badge: '#fffbeb', badgeText: '#d97706', border: '#f59e0b' },
                cierre: { dot: '#4361ee', badge: '#eef2ff', badgeText: '#4361ee', border: '#4361ee' },
                pago_comprometido: { dot: '#22c55e', badge: '#f0fdf4', badgeText: '#16a34a', border: '#22c55e' },
                pagado_confirmado: { dot: '#22c55e', badge: '#f0fdf4', badgeText: '#16a34a', border: '#22c55e' },
                recuperacion_lead: { dot: '#ef4444', badge: '#fff1f2', badgeText: '#dc2626', border: '#ef4444' },
                recuperacion_reunion: { dot: '#ef4444', badge: '#fff1f2', badgeText: '#dc2626', border: '#ef4444' },
                recuperacion_cierre: { dot: '#ef4444', badge: '#fff1f2', badgeText: '#dc2626', border: '#ef4444' },
              }
              const sa = STAGE_ACCENT[lead.current_stage] ?? { dot: '#94a3b8', badge: '#f1f5f9', badgeText: '#475569', border: '#94a3b8' }
              const hasUnread = group.some(l => (l.unread_count ?? 0) > 0)

              const Initial = lead.contact?.name?.trim()?.charAt(0)?.toUpperCase() ?? '?'
              const lastUpdate = lead.updated_at ?? lead.created_at
              const daysSince = lastUpdate ? Math.floor((Date.now() - new Date(lastUpdate + (lastUpdate.endsWith('Z') || lastUpdate.includes('+') ? '' : 'Z')).getTime()) / 86400000) : 0
              const isCold = daysSince >= 3

              const AVATAR_GRADIENTS = [
                'linear-gradient(135deg, #4361ee 0%, #3a0ca3 100%)',
                'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)',
                'linear-gradient(135deg, #0891b2 0%, #164e63 100%)',
                'linear-gradient(135deg, #059669 0%, #064e3b 100%)',
                'linear-gradient(135deg, #d97706 0%, #92400e 100%)',
                'linear-gradient(135deg, #dc2626 0%, #7f1d1d 100%)',
              ]
              const avatarGrad = AVATAR_GRADIENTS[(lead.contact?.name?.charCodeAt(0) ?? 0) % AVATAR_GRADIENTS.length]

              return (
                <div key={lead.id} role="button" tabIndex={0}
                  onClick={() => handleSelect(lead)}
                  onKeyDown={e => e.key === 'Enter' && handleSelect(lead)}
                  className={`relative flex flex-col text-left rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 group${hasUnread ? ' lead-vibrate' : ''}`}
                  style={{
                    animationDelay: hasUnread ? `${(lead.id % 7) * 0.5}s` : undefined,
                    background: active ? '#eef2ff' : isCold ? (daysSince >= 5 ? 'color-mix(in srgb, #ef4444 6%, #ffffff)' : 'color-mix(in srgb, #f59e0b 6%, #ffffff)') : `color-mix(in srgb, ${sa.dot} 5%, #ffffff)`,
                    border: active ? `2px solid #4361ee` : isCold ? (daysSince >= 5 ? `2px solid #ef4444` : `2px solid #f59e0b`) : `2px solid ${sa.border}`,
                    boxShadow: active
                      ? '0 0 0 4px rgba(67,97,238,0.10), 0 8px 24px rgba(67,97,238,0.14)'
                      : isCold
                        ? (daysSince >= 5 ? '0 2px 8px rgba(239,68,68,0.12), 0 0 0 1px rgba(239,68,68,0.25)' : '0 2px 8px rgba(245,158,11,0.12), 0 0 0 1px rgba(245,158,11,0.25)')
                        : `0 2px 8px rgba(26,32,53,0.06), 0 0 0 1px ${sa.border}40`,
                  }}
                  onMouseEnter={e => {
                    if (!active) {
                      const coldColor = daysSince >= 5 ? 'rgba(239,68,68,0.22)' : daysSince >= 3 ? 'rgba(245,158,11,0.22)' : `${sa.border}60`
                        ; (e.currentTarget as HTMLElement).style.boxShadow = `0 6px 16px rgba(26,32,53,0.10), 0 0 0 2px ${coldColor}`
                        ; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      const coldShadow = daysSince >= 5 ? '0 2px 8px rgba(239,68,68,0.12), 0 0 0 1px rgba(239,68,68,0.25)' : daysSince >= 3 ? '0 2px 8px rgba(245,158,11,0.12), 0 0 0 1px rgba(245,158,11,0.25)' : `0 2px 8px rgba(26,32,53,0.06), 0 0 0 1px ${sa.border}40`
                        ; (e.currentTarget as HTMLElement).style.boxShadow = coldShadow
                        ; (e.currentTarget as HTMLElement).style.transform = ''
                    }
                  }}
                >
                  {/* Delete button — admin/subadmin only, visible on hover */}
                  {isAdmin && (
                    <button
                      onClick={e => handleDeleteGroup(group, e)}
                      title="Eliminar lead"
                      className="absolute top-2.5 right-2.5 z-10 w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(239,35,60,0.10)', color: '#ef233c' }}>
                      <Trash2 size={11} />
                    </button>
                  )}

                  {/* Stage accent bar */}
                  <div className="h-1.5 w-full flex-shrink-0"
                    style={{ background: active ? 'linear-gradient(90deg, #4361ee, #7c87f5)' : isCold ? (daysSince >= 5 ? 'linear-gradient(90deg, #ef4444, #f87171)' : 'linear-gradient(90deg, #f59e0b, #fbbf24)') : `linear-gradient(90deg, ${sa.dot}, ${sa.dot}55)` }} />

                  <div className="p-4 flex flex-col gap-3 flex-1">

                    {/* Header: avatar + name + alert badge */}
                    <div className="flex items-start gap-3">
                      {lead.contact?.avatar_url ? (
                        <img
                          src={lead.contact.avatar_url}
                          alt={lead.contact.name}
                          className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                          style={{ boxShadow: '0 3px 10px rgba(0,0,0,0.18)' }}
                          onError={e => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                            (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex'
                          }}
                        />
                      ) : null}
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-base flex-shrink-0 text-white"
                        style={{
                          background: active ? 'linear-gradient(135deg, #4361ee, #3a0ca3)' : avatarGrad,
                          boxShadow: '0 3px 10px rgba(0,0,0,0.18)',
                          display: lead.contact?.avatar_url ? 'none' : 'flex',
                        }}>
                        {Initial}
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-[13px] font-bold truncate leading-tight" style={{ color: '#1a2035' }}>
                          {lead.contact?.name ?? '—'}
                        </p>
                        <p className="text-[11px] truncate mt-0.5 font-medium" style={{ color: 'rgba(26,32,53,0.50)' }}>
                          {lead.contact?.phone ?? '—'}
                        </p>
                      </div>
                    </div>

                    {/* Cold lead banner */}
                    {!active && isCold && (
                      <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold w-full"
                        style={daysSince >= 5
                          ? { background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }
                          : { background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d' }}>
                        <AlertTriangle size={12} className="flex-shrink-0" />
                        Sin interacción hace {daysSince} {daysSince === 1 ? 'día' : 'días'}
                      </div>
                    )}

                    {/* Group badge */}
                    {isAdmin && lead.group?.name && (
                      <div>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: '#eef2ff', color: '#4361ee', border: '1px solid #c7d2fe' }}>
                          {lead.group.name}
                        </span>
                      </div>
                    )}

                    {/* Expedientes */}
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(26,32,53,0.38)' }}>
                        {group.length === 1 ? '1 Expediente' : `${group.length} Expedientes`}
                      </p>
                      {group.map((l) => {
                        const lsa = STAGE_ACCENT[l.current_stage] ?? STAGE_ACCENT.lead
                        return (
                          <div key={l.id} className="flex items-center gap-2 rounded-lg px-3 py-2"
                            style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: lsa.dot }} />
                            <p className="text-xs font-semibold flex-1 truncate" style={{ color: '#1a2035' }}>
                              {l.area?.name ?? 'Sin Área'}
                            </p>
                            {(l.unread_count ?? 0) > 0 && (
                              <span className="min-w-[16px] h-4 rounded-full text-[9px] font-bold text-white px-1 flex items-center justify-center flex-shrink-0"
                                style={{ background: '#ef4444' }}>
                                {l.unread_count}
                              </span>
                            )}
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: lsa.badge, color: lsa.badgeText }}>
                              {STAGE_LABELS[l.current_stage] ?? l.current_stage}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    {/* CTA */}
                    <div className="mt-auto pt-0.5">
                      <div className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all"
                        style={active ? {
                          background: '#4361ee',
                          color: '#ffffff',
                          border: '1px solid #4361ee',
                          boxShadow: '0 2px 8px rgba(67,97,238,0.28)',
                        } : {
                          background: 'rgba(67,97,238,0.09)',
                          color: '#4361ee',
                          border: '1px solid rgba(67,97,238,0.22)',
                        }}>
                        {active ? '✓ Lead abierto' : 'Abrir lead →'}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Load more */}
        {/* Paginator */}
        {pages > 1 && !loading && (
          <div className="flex items-center justify-between gap-4 pt-4 pb-2">
            <p className="text-xs text-white/45">
              Página {page} de {pages} · {total} expedientes
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => load(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-white/10 text-white/52 hover:text-white hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={15} />
              </button>

              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === pages || Math.abs(p - page) <= 2)
                .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...')
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`e${i}`} className="px-1 text-white/38 text-xs">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => load(p as number)}
                      className={`min-w-[30px] h-[30px] rounded-lg text-xs font-semibold transition-colors ${p === page ? 'bg-lime text-black' : 'border border-white/10 text-white/52 hover:text-white hover:bg-surface-2'
                        }`}
                    >{p}</button>
                  )
                )}

              <button
                onClick={() => load(Math.min(pages, page + 1))}
                disabled={page === pages}
                className="p-1.5 rounded-lg border border-white/10 text-white/52 hover:text-white hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══ DETAIL DRAWER ════════════════════════════════ */}
      {selected && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[1px]" onClick={closeDrawer} />

          {/* Drawer */}
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-surface-1 shadow-2xl z-50 flex flex-col border-l border-white/[0.07]">

            {/* Gradient accent line at top */}
            <div className="h-0.5 flex-shrink-0" style={{ background: 'linear-gradient(90deg, var(--primary) 0%, rgba(204,255,0,0.55) 100%)' }} />

            {/* Drawer header */}
            <div className="px-5 py-3.5 border-b border-white/[0.07] flex items-center gap-3 flex-shrink-0">
              <button onClick={closeDrawer}
                className="p-2 rounded-xl text-white/38 hover:text-white/78 hover:bg-surface-2 transition-colors flex-shrink-0">
                <XIcon size={18} />
              </button>
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-base"
                style={{ background: 'rgba(67,97,238,0.18)', color: 'var(--primary)', border: '1.5px solid rgba(67,97,238,0.32)' }}>
                {selected.contact?.name?.charAt(0)?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-white truncate leading-tight">{selected.contact?.name}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {selected.contact?.phone && (
                    <span className="flex items-center gap-1 text-[11px] text-white/40"><Phone size={10} />{selected.contact.phone}</span>
                  )}
                  <span className={`badge border text-[10px] ${STAGE_COLORS[selected.current_stage] ?? 'bg-white/[0.07] text-white/62'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${STAGE_DOT[selected.current_stage] ?? 'bg-white/30'}`} />
                    {STAGE_LABELS[selected.current_stage] ?? selected.current_stage}
                  </span>
                  {selected.current_stage === 'cierre' && !selected.has_ot && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(239,35,60,0.18)', color: '#ef233c', border: '1px solid rgba(239,35,60,0.35)' }}>
                      <ClipboardList size={9} /> Sin OT
                    </span>
                  )}
                  {selected.area?.name && (
                    <span className="text-[11px] font-semibold text-white/50">{selected.area.name}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {selected.ai_agent_id && (
                  <button
                    onClick={async () => {
                      await dismissAgentLead(selected.id)
                      setSelected(prev => prev ? { ...prev, ai_agent_id: null } : prev)
                      window.dispatchEvent(new CustomEvent('lead-stage-changed'))
                      toast.success('Lead marcado como atendido')
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                    style={{ background: 'rgba(67,97,238,0.15)', color: '#7b9ff5', border: '1px solid rgba(67,97,238,0.30)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(67,97,238,0.25)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(67,97,238,0.15)' }}>
                    <Bot size={12} /> Atendido
                  </button>
                )}
                {PREV_STAGE[selected.current_stage] && (
                  <button
                    onClick={() => setMoveTarget(PREV_STAGE[selected.current_stage])}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.10)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
                    title={`Retroceder a ${STAGE_LABELS[PREV_STAGE[selected.current_stage]]}`}>
                    <ArrowLeft size={12} /> Retroceder
                  </button>
                )}
                {NEXT_STAGE[selected.current_stage] && (
                  <button
                    onClick={() => setMoveTarget(NEXT_STAGE[selected.current_stage])}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                    style={{ background: 'var(--primary)', color: '#fff', border: '1px solid rgba(67,97,238,0.5)', boxShadow: '0 2px 8px rgba(67,97,238,0.35)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px rgba(67,97,238,0.5)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(67,97,238,0.35)' }}
                    title={`Avanzar a ${STAGE_LABELS[NEXT_STAGE[selected.current_stage]]}`}>
                    <ArrowRight size={12} /> Avanzar
                  </button>
                )}
                <button
                  onClick={() => downloadLeadPdf(selected.id, selected.contact?.name).catch(() => toast.error('Error generando PDF'))}
                  className="flex items-center gap-1.5 text-xs border border-white/10 bg-surface-1 hover:bg-surface-2 text-white/55 font-medium px-3 py-1.5 rounded-lg transition-colors">
                  <Download size={13} /> PDF
                </button>
                {canAdmin && (
                  <button onClick={e => handleDelete(e, selected.id)}
                    className="w-8 h-8 flex items-center justify-center border border-white/10 rounded-lg text-white/25 hover:text-danger hover:border-danger/30 hover:bg-danger/10 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Expediente switcher */}
            {selectedContactLeads.length > 1 && (
              <div className="px-6 py-2.5 border-b border-white/[0.07] bg-surface-0 flex items-center gap-2 overflow-x-auto flex-shrink-0">
                <span className="text-[10px] text-white/38 font-semibold uppercase tracking-wide flex-shrink-0">Expediente:</span>
                {selectedContactLeads.map(l => (
                  <button key={l.id}
                    onClick={() => setSelected(l)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all flex-shrink-0 ${selected?.id === l.id
                        ? 'bg-white/10 text-white border border-white/20 shadow-sm'
                        : 'bg-surface-1 border border-white/[0.07] text-white/52 hover:border-white/15'
                      }`}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STAGE_DOT[l.current_stage]}`} />
                    {l.area?.name ?? 'Sin área'}
                  </button>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-white/[0.07] px-3 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.01)' }}>
              {TABS.map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold border-b-2 transition-all ${activeTab === key
                      ? 'border-lime text-white'
                      : 'border-transparent text-white/35 hover:text-white/60 hover:border-white/15'
                    }`}>
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className={`flex-1 min-h-0 ${activeTab === 'chat' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
              {activeTab === 'info' && <InfoTab lead={selected} onUpdate={handleLeadUpdated} onOpenFull={() => setDetailLeadId(selected.id)} />}
              {activeTab === 'chat' && <ChatTab lead={selected} configs={configs} onLeadUpdate={handleLeadUpdated} onClearUnread={clearContactUnread} />}
              {activeTab === 'historial' && <HistorialTab lead={selected} leadId={selected.id} />}
              {activeTab === 'notas' && <NotasTab lead={selected} onSaved={handleLeadUpdated} />}
              {activeTab === 'agendar' && <AgendarTab lead={selected} onLeadUpdated={handleLeadUpdated} />}
            </div>
          </div>
        </>
      )}

      {moveTarget !== null && selected && (
        <MoveLeadModal lead={selected} targetStage={moveTarget} labels={STAGE_LABELS} canConfirmPago={canConfirmPago} userRole={user?.role} onConfirm={handleMove} onClose={() => setMoveTarget(null)} />
      )}

      {showModal && (
        <LeadModal onClose={() => setModal(false)} onSuccess={() => { setModal(false); load() }} />
      )}

      {detailLeadId !== null && (
        <LeadDetailView leadId={detailLeadId} onClose={() => setDetailLeadId(null)} />
      )}
    </div>
  )
}
