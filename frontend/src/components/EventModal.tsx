import { useState, useEffect } from 'react'
import { Trash2, X, Calendar, Link2, Clock, User, ThumbsUp, XCircle } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, updateVendorStatus } from '../api'
import type { CalendarEvent } from '../types'
import { useAuthStore } from '../store/auth'

const EVENT_TYPES = [
  { value: 'reunion',      label: 'Reunión',      color: '#3B82F6' },
  { value: 'llamada',      label: 'Llamada',      color: '#10B981' },
  { value: 'seguimiento',  label: 'Seguimiento',  color: '#F59E0B' },
  { value: 'tarea',        label: 'Tarea',        color: '#8B5CF6' },
]

/** Convert a UTC datetime string from the API to local time for <input type="datetime-local"> */
function toLocalInput(utcStr?: string | null): string {
  if (!utcStr) return ''
  const d = new Date(utcStr)
  if (isNaN(d.getTime())) return utcStr.slice(0, 16)
  // 'sv' locale returns ISO-like "YYYY-MM-DD HH:MM:SS" in local time
  return d.toLocaleString('sv', { hour12: false }).slice(0, 16).replace(' ', 'T')
}

export function EventModal({
  event, vendors, onClose, onSaved, onDeleted, defaultDate,
}: {
  event: CalendarEvent | null
  vendors: any[]
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
  defaultDate?: string
}) {
  const { user: me } = useAuthStore()
  const [form, setForm] = useState({
    title: event?.title ?? '',
    start_time: event ? toLocalInput(event.start_time) : (defaultDate ? `${defaultDate}T09:00` : ''),
    end_time:   event ? toLocalInput(event.end_time)   : (defaultDate ? `${defaultDate}T09:30` : ''),
    event_type: event?.event_type ?? 'reunion',
    notes: event?.notes ?? '',
    color: event?.color ?? '#3B82F6',
    assigned_to: event?.assigned_to?.toString() ?? (vendors[0]?.id?.toString() ?? ''),
  })
  const [saving, setSaving] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const set = (k: string, v: string) => setForm(f => {
    const updated = { ...f, [k]: v }
    if (k === 'start_time' && v) {
      const [datePart, timePart] = v.split('T')
      if (datePart && timePart) {
        const [h, m] = timePart.split(':').map(Number)
        const pad = (n: number) => n.toString().padStart(2, '0')
        const total = h * 60 + m + 30
        const endH = Math.floor(total / 60) % 24
        const endM = total % 60
        const endDate = total >= 1440
          ? (() => { const d = new Date(`${datePart}T12:00:00`); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })()
          : datePart
        updated.end_time = `${endDate}T${pad(endH)}:${pad(endM)}`
      }
    }
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

  useEffect(() => {
    const found = EVENT_TYPES.find(t => t.value === form.event_type)
    if (found) set('color', found.color)
  }, [form.event_type])

  const toUtcIso = (localStr: string): string => {
    if (!localStr) return localStr
    const d = new Date(localStr)
    return isNaN(d.getTime()) ? localStr : d.toISOString()
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || !form.start_time || !form.end_time) {
      toast.error('Completa título y horario'); return
    }
    if (new Date(form.end_time) <= new Date(form.start_time)) {
      toast.error('La hora de fin debe ser después del inicio'); return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        start_time: toUtcIso(form.start_time),
        end_time: toUtcIso(form.end_time),
        assigned_to: form.assigned_to ? parseInt(form.assigned_to) : null,
      }
      if (event) {
        await updateCalendarEvent(event.id, payload)
        toast.success('Reunión actualizada')
      } else {
        await createCalendarEvent(payload)
        toast.success(payload.assigned_to ? 'Reunión agendada — vendedor notificado' : 'Reunión agendada')
      }
      onSaved()
    } catch { toast.error('Error al guardar') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!event || !confirm('¿Eliminar esta reunión?')) return
    try {
      await deleteCalendarEvent(event.id)
      toast.success('Reunión eliminada')
      onDeleted?.()
      onClose()
    } catch { toast.error('Error al eliminar') }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-[100] p-0 sm:p-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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


          <div className="flex gap-3 pt-4 sticky bottom-0 bg-surface-1 border-t border-white/[0.07]">
            {event && (
              <button type="button" onClick={handleDelete}
                className="inline-flex items-center gap-2 px-4 py-3 bg-danger/10 text-danger rounded-xl hover:bg-danger/20 transition-colors font-medium text-sm">
                <Trash2 size={16} /> Eliminar
              </button>
            )}
            <button type="submit" disabled={saving}
              className="flex-1 bg-surface-1 text-white font-bold py-3 rounded-xl hover:bg-surface-2 transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50">
              {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {event ? 'Guardar Cambios' : 'Agendar Reunión'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
