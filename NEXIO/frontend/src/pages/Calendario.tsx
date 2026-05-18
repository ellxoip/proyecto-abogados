import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import {
  getCalendarEvents, createCalendarEvent, deleteCalendarEvent, updateCalendarEvent, getUsers,
  getGoogleStatus, getGoogleAuthUrl, disconnectGoogle, getGoogleEvents, syncAllToGoogle,
  getGroupVendors,
} from '../api'
import type { CalendarEvent } from '../types'
import toast from 'react-hot-toast'
import { X, Plus, Search, ChevronLeft, RefreshCw, Link2, Link2Off } from 'lucide-react'
import { format } from 'date-fns'
import { useAuthStore } from '../store/auth'

export default function Calendario() {
  const { user: me } = useAuthStore()
  const isAdmin = me?.role === 'superadmin' || me?.role === 'subadmin'
  const [searchParams] = useSearchParams()

  const [events, setEvents]       = useState<CalendarEvent[]>([])
  const [googleEvents, setGoogleEvents] = useState<any[]>([])
  const [googleStatus, setGoogleStatus] = useState<{ configured: boolean; connected: boolean; google_email: string | null } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [users, setUsers]         = useState<any[]>([])
  const [viewUserId, setViewUserId] = useState<number | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null)
  const [form, setForm] = useState({
    title: '', start_time: '', end_time: '',
    event_type: 'reunion', notes: '', color: '#3B82F6', assigned_to: '',
  })
  const [groupVendors, setGroupVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  const pickerRef = useRef<HTMLDivElement>(null)
  const isAgendadora = me?.role === 'agendadora'

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const load = async (uid: number | null = viewUserId) => {
    try {
      const params = isAdmin && uid ? { user_id: uid } : undefined
      setEvents(await getCalendarEvents(params))
    } catch {
      toast.error('Error cargando eventos')
    }
  }

  const loadGoogleStatus = async () => {
    try { setGoogleStatus(await getGoogleStatus()) } catch {}
  }

  const loadGoogleEvents = async () => {
    try { setGoogleEvents(await getGoogleEvents()) } catch {}
  }

  const handleGoogleConnect = async () => {
    if (!googleStatus?.configured) {
      toast.error('Google Calendar no está configurado aún. Contacta al administrador del sistema.')
      return
    }
    try {
      const { url } = await getGoogleAuthUrl()
      const popup = window.open(url, 'google-auth', 'width=500,height=650,scrollbars=yes')
      const handler = (e: MessageEvent) => {
        if (e.data?.googleCalendar === 'connected') {
          window.removeEventListener('message', handler)
          popup?.close()
          toast.success(`Google Calendar conectado`)
          loadGoogleStatus()
          loadGoogleEvents()
        } else if (e.data?.googleCalendar === 'error') {
          window.removeEventListener('message', handler)
          toast.error('Error al conectar Google Calendar')
        }
      }
      window.addEventListener('message', handler)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Google Calendar no configurado aún')
    }
  }

  const handleGoogleDisconnect = async () => {
    if (!confirm('¿Desconectar Google Calendar?')) return
    try {
      await disconnectGoogle()
      setGoogleStatus(s => s ? { ...s, connected: false, google_email: null } : s)
      setGoogleEvents([])
      toast.success('Google Calendar desconectado')
    } catch { toast.error('Error al desconectar') }
  }

  const handleSyncAll = async () => {
    setSyncing(true)
    try {
      const r = await syncAllToGoogle()
      toast.success(`Sincronizados ${r.synced} eventos${r.failed ? ` (${r.failed} errores)` : ''}`)
    } catch { toast.error('Error al sincronizar') } finally { setSyncing(false) }
  }

  useEffect(() => {
    load(null)
    loadGoogleStatus()
    if (isAdmin) getUsers().then(setUsers)
    if (isAgendadora) getGroupVendors().then(setGroupVendors).catch(() => {})
  }, [])

  useEffect(() => {
    if (googleStatus?.connected) loadGoogleEvents()
    else setGoogleEvents([])
  }, [googleStatus?.connected])

  const viewingUser = viewUserId ? users.find(u => u.id === viewUserId) : null

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    const list = q
      ? users.filter(u => u.name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
      : users
    return list.slice(0, 50)
  }, [users, userSearch])

  const selectUser = (u: any) => {
    setViewUserId(u.id)
    setShowPicker(false)
    setUserSearch('')
    load(u.id)
  }

  const backToMine = () => {
    setViewUserId(null)
    load(null)
  }

  const crmFcEvents = events.map(e => ({
    id: e.id.toString(),
    title: e.title,
    start: e.start_time,
    end: e.end_time,
    backgroundColor: e.color,
    borderColor: e.color,
    extendedProps: { event: e },
  }))

  const googleFcEvents = googleEvents.map(e => ({
    id: `g_${e.id}`,
    title: e.title,
    start: e.start,
    end: e.end,
    allDay: e.allDay,
    backgroundColor: '#4285f4',
    borderColor: '#1a73e8',
    extendedProps: { googleEvent: e },
    url: e.htmlLink || undefined,
  }))

  const fcEvents = [...crmFcEvents, ...googleFcEvents]

  const openCreate = (dateStr?: string) => {
    const now = dateStr || format(new Date(), "yyyy-MM-dd'T'HH:mm")
    setForm({
      title: '',
      start_time: now + (dateStr ? 'T09:00' : ''),
      end_time:   now + (dateStr ? 'T10:00' : ''),
      event_type: 'reunion', notes: '', color: '#1e293b',
      assigned_to: isAgendadora ? (groupVendors[0]?.id?.toString() ?? '') : '',
    })
    setEditEvent(null)
    setShowModal(true)
  }

  const openEdit = (event: CalendarEvent) => {
    setEditEvent(event)
    setForm({
      title: event.title,
      start_time: event.start_time.slice(0, 16),
      end_time:   event.end_time.slice(0, 16),
      event_type: event.event_type,
      notes: event.notes || '',
      color: event.color,
      assigned_to: event.assigned_to?.toString() ?? '',
    })
    setShowModal(true)
  }

  // Auto-open event when event_id is in URL (e.g. from notification click)
  useEffect(() => {
    const eid = searchParams.get('event_id')
    if (eid && events.length > 0) {
      const found = events.find(e => e.id === parseInt(eid))
      if (found) openEdit(found)
    }
  }, [events])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || !form.start_time || !form.end_time) {
      toast.error('Completa título y fechas')
      return
    }
    setLoading(true)
    try {
      const payload = {
        ...form,
        assigned_to: form.assigned_to ? parseInt(form.assigned_to) : null,
      }
      if (editEvent) {
        await updateCalendarEvent(editEvent.id, payload)
        toast.success('Evento actualizado')
      } else {
        await createCalendarEvent(payload)
        toast.success(payload.assigned_to ? 'Reunión agendada — vendedor notificado' : 'Evento creado')
      }
      setShowModal(false)
      load()
    } catch {
      toast.error('Error guardando evento')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!editEvent) return
    if (!confirm('¿Eliminar este evento?')) return
    try {
      await deleteCalendarEvent(editEvent.id)
      toast.success('Evento eliminado')
      setShowModal(false)
      load()
    } catch {
      toast.error('Error al eliminar')
    }
  }

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const colorOptions = [
    { color: '#1e293b', label: 'Oscuro' },
    { color: '#10B981', label: 'Esmeralda' },
    { color: '#F59E0B', label: 'Ámbar' },
    { color: '#EF4444', label: 'Rojo' },
    { color: '#8B5CF6', label: 'Púrpura' },
    { color: '#64748B', label: 'Slate' },
  ]

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Calendario</h1>
          <p className="text-white/62 text-sm mt-0.5">
            {viewingUser
              ? <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-white/30 inline-block" />
                  Viendo calendario de <strong className="text-white/85">{viewingUser.name}</strong>
                </span>
              : `${events.length} eventos programados`
            }
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Back to my calendar */}
          {viewingUser && (
            <button onClick={backToMine}
              className="flex items-center gap-1.5 text-sm font-medium text-white/78 border border-white/10 bg-surface-1 hover:bg-surface-0 px-3 py-2.5 rounded-xl transition-colors">
              <ChevronLeft size={15} /> Mi calendario
            </button>
          )}

          {/* Google Calendar — visible for all users */}
          {googleStatus?.connected ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSyncAll}
                disabled={syncing}
                title="Sincronizar eventos CRM a Google Calendar"
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-2.5 rounded-xl border border-white/10 bg-surface-1 text-white/78 hover:bg-surface-0 transition-colors"
              >
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Sincronizando...' : 'Sincronizar'}
              </button>
              <button
                onClick={handleGoogleDisconnect}
                title={`Conectado como ${googleStatus.google_email}`}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-2.5 rounded-xl border border-lime/25 text-lime bg-lime/10 hover:bg-lime/15 transition-colors"
              >
                <Link2 size={14} />
                {googleStatus.google_email ? googleStatus.google_email.split('@')[0] : 'Google'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleGoogleConnect}
              title={!googleStatus?.configured ? 'Google Calendar no configurado por el administrador del sistema' : 'Conectar mi Google Calendar'}
              className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2.5 rounded-xl border transition-colors ${
                googleStatus?.configured
                  ? 'border-white/10 bg-surface-1 text-white/78 hover:bg-surface-0'
                  : 'border-white/[0.07] bg-surface-0 text-white/52 cursor-not-allowed'
              }`}
            >
              <Link2Off size={14} />
              {googleStatus?.configured ? 'Conectar Google Calendar' : 'Google Calendar (no configurado)'}
            </button>
          )}

          {/* User picker (admin only) */}
          {isAdmin && (
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => setShowPicker(p => !p)}
                className={`flex items-center gap-2 text-sm font-medium px-3 py-2.5 rounded-xl border transition-colors ${
                  showPicker
                    ? 'border-white/25 bg-surface-0 text-white'
                    : 'border-white/10 bg-surface-1 text-white/78 hover:bg-surface-0'
                }`}
              >
                <Search size={14} />
                {viewingUser ? 'Cambiar usuario' : 'Ver otro usuario'}
              </button>

              {showPicker && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-surface-1 border border-white/10 rounded-xl shadow-lg z-30 overflow-hidden">
                  <div className="p-2 border-b border-white/[0.07]">
                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/52 pointer-events-none" />
                      <input
                        autoFocus
                        value={userSearch}
                        onChange={e => setUserSearch(e.target.value)}
                        placeholder="Buscar por nombre..."
                        className="w-full pl-8 pr-3 py-2 text-sm bg-surface-0 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/15/15 focus:border-white/25"
                      />
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    {filteredUsers.length === 0 ? (
                      <p className="text-xs text-white/52 text-center py-4">Sin resultados</p>
                    ) : filteredUsers.map(u => (
                      <button key={u.id} onClick={() => selectUser(u)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-0 transition-colors ${
                          u.id === viewUserId ? 'bg-surface-0' : ''
                        }`}>
                        <div className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0 text-sm font-bold text-white/78">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white/90 truncate">{u.name}</p>
                          <p className="text-xs text-white/52 capitalize">{u.role}</p>
                        </div>
                        {u.id === viewUserId && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white/45 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button onClick={() => openCreate()} className="btn-primary flex-shrink-0">
            <Plus size={16} /> Nuevo Evento
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-surface-1 rounded-2xl border border-white/[0.07] shadow-sm overflow-hidden">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={isMobile ? 'dayGridMonth' : 'timeGridWeek'}
          locale="es"
          events={fcEvents}
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
          selectable
          selectMirror
          dayMaxEvents
          height={isMobile ? 500 : 680}
          nowIndicator
          scrollTime={new Date().getHours() > 0 ? `${new Date().getHours() - 1}:00:00` : '00:00:00'}
          select={(info: any) => openCreate(info.startStr)}
          eventClick={(info: any) => {
            if (info.event.extendedProps.googleEvent) {
              const link = info.event.extendedProps.googleEvent.htmlLink
              if (link) window.open(link, '_blank')
              info.jsEvent.preventDefault()
              return
            }
            openEdit(info.event.extendedProps.event as CalendarEvent)
          }}
        />
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
          <div className="bg-surface-1 rounded-2xl shadow-modal w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.07]">
              <h2 className="text-lg font-bold text-white">
                {editEvent ? 'Editar Evento' : 'Nuevo Evento'}
              </h2>
              <button onClick={() => setShowModal(false)}
                className="p-2 hover:bg-surface-2 rounded-lg text-white/62">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              <div>
                <label className="input-label">Título *</label>
                <input className="input" value={form.title} onChange={e => set('title', e.target.value)}
                  placeholder="Reunión con cliente..." required />
              </div>

              {/* Vendor picker — agendadoras only */}
              {isAgendadora && groupVendors.length > 0 && (
                <div>
                  <label className="input-label">Agendar para vendedor</label>
                  <select className="input" value={form.assigned_to}
                    onChange={e => set('assigned_to', e.target.value)}>
                    <option value="">Solo en mi agenda</option>
                    {groupVendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
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
                <label className="input-label">Tipo</label>
                <select className="input" value={form.event_type} onChange={e => set('event_type', e.target.value)}>
                  <option value="reunion">Reunión</option>
                  <option value="llamada">Llamada</option>
                  <option value="seguimiento">Seguimiento</option>
                  <option value="tarea">Tarea</option>
                </select>
              </div>

              <div>
                <label className="input-label">Color</label>
                <div className="flex gap-2.5 flex-wrap mt-1">
                  {colorOptions.map(opt => (
                    <button key={opt.color} type="button" onClick={() => set('color', opt.color)}
                      title={opt.label}
                      className={`w-8 h-8 rounded-full border-4 transition-transform hover:scale-110 ${
                        form.color === opt.color ? 'border-white/15 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: opt.color }} />
                  ))}
                </div>
              </div>

              <div>
                <label className="input-label">Notas y Detalles de la reunión</label>
                <textarea className="input" rows={4} value={form.notes}
                  onChange={e => set('notes', e.target.value)} placeholder="Agrega links de Meet, instrucciones o detalles para el vendedor..." />
              </div>
            </form>

            <div className="px-6 py-4 border-t border-white/[0.07] flex gap-3">
              {editEvent && (
                <button type="button" onClick={handleDelete}
                  className="bg-surface-1 border border-white/10 hover:bg-danger/10 hover:border-danger/30 hover:text-danger text-white/62 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors">
                  Eliminar
                </button>
              )}
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={loading} className="btn-primary flex-1">
                {loading ? 'Guardando...' : editEvent ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
