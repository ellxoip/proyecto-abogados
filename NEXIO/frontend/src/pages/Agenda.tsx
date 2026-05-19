import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import {
  getCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent,
  getGroupVendors, getGoogleStatus, getGoogleAuthUrl, disconnectGoogle, syncAllToGoogle, getGoogleEvents,
  syncEventToGoogle, updateVendorStatus,
} from '../api'
import type { CalendarEvent } from '../types'
import { useAuthStore } from '../store/auth'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseLocalDate } from '../utils/dates'
import { Plus, X, Calendar, Link2, Link2Off, RefreshCw, Clock, User, ThumbsUp, XCircle } from 'lucide-react'

const EVENT_TYPES = [
  { value: 'reunion',      label: 'Reunión',      color: '#3B82F6' },
  { value: 'llamada',      label: 'Llamada',      color: '#10B981' },
  { value: 'seguimiento',  label: 'Seguimiento',  color: '#F59E0B' },
  { value: 'tarea',        label: 'Tarea',        color: '#8B5CF6' },
]

function EventModal({
  event, vendors, onClose, onSaved, onDeleted, defaultDate, googleConnected,
}: {
  event: CalendarEvent | null
  vendors: any[]
  onClose: () => void
  onSaved: (savedId?: number) => void
  onDeleted?: () => void
  defaultDate?: string
  googleConnected?: boolean
}) {
  const { user: me } = useAuthStore()

  const addThirtyMin = (startStr: string): string => {
    const [datePart, timePart] = startStr.split('T')
    if (!datePart || !timePart) return startStr
    const [h, m] = timePart.split(':').map(Number)
    const pad = (n: number) => n.toString().padStart(2, '0')
    const total = h * 60 + m + 30
    const endH = Math.floor(total / 60) % 24
    const endM = total % 60
    return `${datePart}T${pad(endH)}:${pad(endM)}`
  }

  const initStart = event?.start_time?.slice(0, 16) ?? (defaultDate ? `${defaultDate}T09:00` : '')
  const [form, setForm] = useState({
    title: event?.title ?? '',
    start_time: initStart,
    end_time:   initStart ? addThirtyMin(initStart) : '',
    event_type: event?.event_type ?? 'reunion',
    notes: event?.notes ?? '',
    color: event?.color ?? '#3B82F6',
    assigned_to: event?.assigned_to?.toString() ?? (vendors[0]?.id?.toString() ?? ''),
  })
  const [saving, setSaving] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const set = (k: string, v: string) => setForm(f => {
    const updated = { ...f, [k]: v }
    if (k === 'start_time' && v) updated.end_time = addThirtyMin(v)
    return updated
  })

  const isVendedor = me?.role === 'vendedor'

  const handleVendorStatus = async (status: string) => {
    if (!event) return
    setUpdatingStatus(true)
    try {
      await updateVendorStatus(event.id, status)
      toast.success(status === 'altamente_interesado' ? 'Marcado como exitoso' : 'Estado actualizado')
      onSaved()
    } catch { toast.error('Error actualizando estado') }
    finally { setUpdatingStatus(false) }
  }

  // Sync color with event type
  useEffect(() => {
    const found = EVENT_TYPES.find(t => t.value === form.event_type)
    if (found) set('color', found.color)
  }, [form.event_type])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || !form.start_time || !form.end_time) {
      toast.error('Completa título y horario'); return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        assigned_to: form.assigned_to ? parseInt(form.assigned_to) : null,
      }
      let savedId: number | undefined
      if (event) {
        const updated = await updateCalendarEvent(event.id, payload)
        savedId = updated?.id ?? event.id
        toast.success('Reunión actualizada')
      } else {
        const created = await createCalendarEvent(payload)
        savedId = created?.id
        toast.success(payload.assigned_to ? 'Reunión agendada — vendedor notificado' : 'Reunión agendada')
      }
      onSaved(savedId)
      // Auto-sync to Google Calendar if connected
      if (googleConnected && savedId) {
        syncEventToGoogle(savedId).catch(() => {})
      }
    } catch { toast.error('Error al guardar') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!event || !confirm('¿Eliminar esta reunión?')) return
    try {
      await deleteCalendarEvent(event.id)
      toast.success('Reunión eliminada')
      onDeleted?.()
    } catch { toast.error('Error al eliminar') }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-surface-1 w-full sm:rounded-2xl sm:max-w-lg shadow-2xl max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] sticky top-0 bg-surface-1 z-10">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: form.color }} />
            <h2 className="text-base font-bold text-white">
              {event ? 'Editar Reunión' : 'Nueva Reunión'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-2 rounded-xl text-white/52">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div>
            <label className="input-label">Título *</label>
            <input className="input" value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Reunión con cliente, Llamada de seguimiento..." required />
          </div>

          {vendors.length > 0 && (
            <div>
              <label className="input-label">Agendar para</label>
              <select className="input" value={form.assigned_to}
                onChange={e => set('assigned_to', e.target.value)}>
                <option value="">Solo en mi agenda</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name} ({v.role})</option>
                ))}
              </select>
            </div>
          )}

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

          <div>
            <label className="input-label">Tipo de reunión</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {EVENT_TYPES.map(t => (
                <button key={t.value} type="button"
                  onClick={() => set('event_type', t.value)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    form.event_type === t.value
                      ? 'border-lime bg-surface-1 text-white shadow-sm'
                      : 'border-white/10 text-white/78 hover:border-white/25 hover:bg-surface-0'
                  }`}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: form.event_type === t.value ? 'white' : t.color }} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="input-label">Notas y Detalles de la reunión</label>
            <div className="space-y-2">
              <textarea className="input" rows={5} value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Observaciones, links de Meet, dirección, etc..." />
              
              {form.notes && (
                <div className="p-3 bg-surface-0 rounded-xl border border-white/[0.07]">
                  <p className="text-[10px] font-bold text-white/52 uppercase tracking-widest mb-1">Previsualización de Links</p>
                  <div className="text-xs text-white/78 break-words">
                    {form.notes.split(/(\s+)/).map((part, i) => {
                      if (part.match(/^https?:\/\/[^\s]+$/)) {
                        return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-neon underline hover:text-neon/70 break-all">{part}</a>
                      }
                      return part
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Vendedor outcome section */}
          {event && isVendedor && (
            <div className="pt-2 border-t border-white/[0.07]">
              <p className="text-xs font-semibold text-white/52 uppercase tracking-wide mb-2">Resultado de la reunión</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => handleVendorStatus('sin_exito')} disabled={updatingStatus}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    event.vendor_status === 'sin_exito'
                      ? 'bg-danger/15 border-danger/30 text-danger'
                      : 'border-white/10 text-white/78 hover:bg-danger/10 hover:border-danger/30'
                  }`}>
                  <XCircle size={14} /> Sin éxito
                </button>
                <button type="button" onClick={() => handleVendorStatus('altamente_interesado')} disabled={updatingStatus}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    event.vendor_status === 'altamente_interesado'
                      ? 'bg-lime/15 border-lime/30 text-lime'
                      : 'border-white/10 text-white/78 hover:bg-lime/10 hover:border-lime/20'
                  }`}>
                  <ThumbsUp size={14} /> Exitoso / Alt. Interesado
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {event && (
              <button type="button" onClick={handleDelete}
                className="px-4 py-2.5 border border-white/10 hover:bg-danger/10 hover:border-danger/30 hover:text-danger text-white/52 rounded-xl text-sm font-medium transition-colors">
                Eliminar
              </button>
            )}
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Guardando...' : event ? 'Actualizar' : 'Agendar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Agenda() {
  const { user: me } = useAuthStore()
  const [searchParams] = useSearchParams()
  const calRef = useRef<any>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [googleEvents, setGoogleEvents] = useState<any[]>([])
  const [googleStatus, setGoogleStatus] = useState<any>(null)
  const [vendors, setVendors] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null)
  const [defaultDate, setDefaultDate] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  const [currentView, setCurrentView] = useState<string>(
    window.innerWidth < 640 ? 'dayGridMonth' : 'timeGridWeek'
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const h = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
      setCurrentView(e.matches ? 'dayGridMonth' : 'timeGridWeek')
    }
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  const load = async () => {
    try {
      const evs: CalendarEvent[] = await getCalendarEvents()
      setEvents(evs)
      // Auto-open event if navigated from a notification
      const eid = searchParams.get('event_id')
      if (eid) {
        const found = evs.find(e => e.id === parseInt(eid))
        if (found) openEdit(found)
      }
    } catch {}
  }

  const loadGoogle = async () => {
    try {
      const s = await getGoogleStatus()
      setGoogleStatus(s)
      if (s.connected) setGoogleEvents(await getGoogleEvents())
    } catch {}
  }

  useEffect(() => {
    load()
    loadGoogle()
    getGroupVendors().then(setVendors).catch(() => {})
  }, [])

  const handleConnect = async () => {
    try {
      const { url } = await getGoogleAuthUrl()
      const popup = window.open(url, 'google-auth', 'width=500,height=650')
      const h = async (e: MessageEvent) => {
        if (e.data?.googleCalendar === 'connected') {
          window.removeEventListener('message', h)
          popup?.close()
          toast.success('Google Calendar conectado')
          await loadGoogle()
          // Auto-sync all existing events after first connect
          try {
            setSyncing(true)
            const r = await syncAllToGoogle()
            if (r.synced > 0) toast.success(`${r.synced} reuniones sincronizadas automáticamente`)
          } catch {} finally { setSyncing(false) }
        }
      }
      window.addEventListener('message', h)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Google Calendar no configurado. El técnico debe configurar OAuth.')
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('¿Desconectar Google Calendar?')) return
    try {
      await disconnectGoogle()
      setGoogleStatus((s: any) => s ? { ...s, connected: false } : s)
      setGoogleEvents([])
      toast.success('Desconectado')
    } catch {}
  }

  const handleSyncAll = async () => {
    setSyncing(true)
    try {
      const r = await syncAllToGoogle()
      toast.success(`${r.synced} eventos sincronizados`)
    } catch { toast.error('Error al sincronizar') }
    finally { setSyncing(false) }
  }

  const openCreate = (dateStr?: string) => {
    setEditEvent(null)
    setDefaultDate(dateStr?.slice(0, 10) ?? format(new Date(), 'yyyy-MM-dd'))
    setShowModal(true)
  }

  const openEdit = (ev: CalendarEvent) => {
    setEditEvent(ev)
    setDefaultDate('')
    setShowModal(true)
  }

  const crmFcEvents = events.map(ev => {
    const isVendorEvent = ev.created_by !== me?.id
    // Override colors based on vendor_status
    let bgColor = ev.color
    let borderColor = ev.color
    if (ev.vendor_status === 'altamente_interesado') { bgColor = '#10b981'; borderColor = '#059669' }
    else if (ev.vendor_status === 'sin_exito') { bgColor = '#ef4444'; borderColor = '#dc2626' }
    return {
      id: ev.id.toString(),
      title: ev.title,
      start: ev.start_time,
      end: ev.end_time,
      backgroundColor: bgColor,
      borderColor: borderColor,
      textColor: '#fff',
      extendedProps: { event: ev, isVendorEvent },
    }
  })

  const googleFcEvents = googleEvents.map(ev => ({
    id: `g_${ev.id}`,
    title: ev.title,
    start: ev.start,
    end: ev.end,
    allDay: ev.allDay,
    backgroundColor: '#4285f4',
    borderColor: '#1a73e8',
    textColor: '#fff',
    extendedProps: { googleEvent: ev },
    url: ev.htmlLink || undefined,
  }))

  const allEvents = [...crmFcEvents, ...googleFcEvents]

  // Stats
  const today = format(new Date(), 'yyyy-MM-dd')
  const todayEvents = events.filter(e => e.start_time.startsWith(today))
  const upcomingEvents = events.filter(e => parseLocalDate(e.start_time) > new Date()).slice(0, 5)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calendar size={22} className="text-white/78" />
            {me?.role === 'vendedor' ? 'Mi Agenda' : 'Agenda'}
          </h1>
          <p className="text-white/62 text-sm mt-0.5">
            {todayEvents.length > 0
              ? `${todayEvents.length} reunión${todayEvents.length !== 1 ? 'es' : ''} hoy`
              : 'Sin reuniones hoy'
            }
            {vendors.length > 0 && ` · ${vendors.map(v => v.name.split(' ')[0]).join(', ')}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Google Calendar — always visible */}
          {googleStatus && (
            googleStatus.connected ? (
              <div className="flex items-center gap-2">
                <button onClick={handleSyncAll} disabled={syncing}
                  className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border border-white/10 bg-surface-1 text-white/78 hover:bg-surface-0 transition-colors">
                  <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Sincronizando...' : 'Sincronizar'}
                </button>
                <button onClick={handleDisconnect}
                  className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border border-lime/30 text-lime bg-lime/10 hover:bg-lime/15 transition-colors">
                  <Link2 size={13} />
                  {googleStatus.google_email?.split('@')[0] ?? 'Google'}
                </button>
              </div>
            ) : googleStatus.configured ? (
              <button onClick={handleConnect}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border border-neon/30 text-neon bg-neon/8 hover:bg-neon/15 transition-colors">
                <Link2Off size={13} /> Conectar Google Calendar
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-white/35 px-3 py-2 rounded-xl border border-white/[0.06] bg-surface-1 cursor-default" title="El técnico debe configurar Google OAuth">
                <Link2Off size={12} /> Google Calendar no configurado
              </span>
            )
          )}
          <button onClick={() => openCreate()} className="btn-primary">
            <Plus size={15} /> Nueva Reunión
          </button>
        </div>
      </div>

      {/* Mobile: upcoming list */}
      {isMobile && upcomingEvents.length > 0 && (
        <div className="bg-surface-1 rounded-2xl border border-white/[0.07] shadow-sm divide-y divide-white/5">
          <div className="px-4 py-3 flex items-center justify-between">
            <p className="text-xs font-bold text-white/52 uppercase tracking-widest">Próximas reuniones</p>
          </div>
          {upcomingEvents.map(ev => (
            <button key={ev.id} onClick={() => openEdit(ev)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-0 transition-colors">
              <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white/90 text-sm truncate">{ev.title}</p>
                <p className="text-xs text-white/52 flex items-center gap-1 mt-0.5">
                  <Clock size={10} />
                  {format(parseLocalDate(ev.start_time), "d MMM yyyy · HH:mm", { locale: es })}
                </p>
              </div>
              {ev.assigned_to && (
                <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0">
                  <User size={12} className="text-white/62" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Calendar */}
      <div className="bg-surface-1 rounded-2xl border border-white/[0.07] shadow-sm overflow-hidden">
        <style>{`
          .fc .fc-timegrid-slot { height: 48px !important; }
          .fc .fc-timegrid-now-indicator-line { border-color: #4361ee !important; border-width: 2px !important; }
          .fc .fc-timegrid-now-indicator-arrow { border-top-color: #4361ee !important; border-bottom-color: #4361ee !important; }
          .fc .fc-event { box-shadow: 0 1px 4px rgba(0,0,0,0.35) !important; cursor: pointer !important; transition: transform 0.1s !important; opacity: 1 !important; }
          .fc .fc-event:hover { transform: translateY(-1px) !important; box-shadow: 0 4px 10px rgba(0,0,0,0.40) !important; }
          .fc .fc-timegrid-event { border-radius: 8px !important; padding: 4px 8px !important; }
          .fc .fc-daygrid-event { border-radius: 6px !important; padding: 1px 4px !important; opacity: 1 !important; }
          .fc .fc-daygrid-event .fc-event-main { color: #fff !important; font-weight: 600 !important; }
          .fc .fc-event-title { color: #fff !important; font-weight: 600 !important; }
          .fc .fc-event-time { color: rgba(255,255,255,0.90) !important; }
          .fc .fc-highlight { background: rgba(67,97,238,0.08) !important; }
          .fc .fc-button { background: #ffffff !important; border: 1px solid #e2e8f0 !important; color: #1a2035 !important; border-radius: 10px !important; font-size: 12px !important; font-weight: 600 !important; padding: 6px 12px !important; box-shadow: none !important; transition: all 0.15s !important; text-transform: none !important; }
          .fc .fc-button:hover { background: #f0f4f8 !important; border-color: #cbd5e1 !important; color: #1a2035 !important; }
          .fc .fc-button-active, .fc .fc-button:active { background: rgba(67,97,238,0.12) !important; color: #4361ee !important; border-color: rgba(67,97,238,0.30) !important; }
          .fc .fc-button-primary:not(:disabled).fc-button-active { background: rgba(67,97,238,0.12) !important; color: #4361ee !important; border-color: rgba(67,97,238,0.30) !important; }
          .fc .fc-today-button { background: rgba(67,97,238,0.10) !important; color: #4361ee !important; border-color: rgba(67,97,238,0.25) !important; }
          .fc .fc-today-button:hover { background: rgba(67,97,238,0.18) !important; }
          @media (max-width: 640px) {
            .fc .fc-button { padding: 5px 9px !important; font-size: 11px !important; }
          }
        `}</style>
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={currentView}
          locale="es"
          events={allEvents}
          headerToolbar={isMobile ? {
            left: 'prev,next',
            center: 'title',
            right: 'today',
          } : {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          buttonText={{ today: 'Hoy', month: 'Mes', week: 'Semana', day: 'Día' }}
          timeZone="America/Santiago"
          allDaySlot={false}
          selectable
          selectMirror
          dayMaxEvents={3}
          height={isMobile ? 480 : 680}
          nowIndicator
          scrollTime={new Date().getHours() > 0 ? `${new Date().getHours() - 1}:00:00` : '00:00:00'}
          select={info => openCreate(info.startStr)}
          eventClick={info => {
            if (info.event.extendedProps.googleEvent) {
              const link = info.event.extendedProps.googleEvent.htmlLink
              if (link) window.open(link, '_blank')
              info.jsEvent.preventDefault()
              return
            }
            openEdit(info.event.extendedProps.event as CalendarEvent)
          }}
          eventContent={arg => {
            const isGoogle = !!arg.event.extendedProps.googleEvent
            const isVendor = arg.event.extendedProps.isVendorEvent
            return (
              <div className="flex items-center gap-1 overflow-hidden w-full">
                {isGoogle && <span className="text-[9px] opacity-70 flex-shrink-0 font-bold text-white/52">G</span>}
                {isVendor && <span className="w-1.5 h-1.5 rounded-full bg-surface-1/60 flex-shrink-0" />}
                <span className="truncate text-[11px] font-bold text-white">{arg.event.title}</span>
              </div>
            )
          }}
        />
      </div>

      {showModal && (
        <EventModal
          event={editEvent}
          vendors={vendors}
          defaultDate={defaultDate}
          googleConnected={!!googleStatus?.connected}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
          onDeleted={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}
