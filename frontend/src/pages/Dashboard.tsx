import { useState, useEffect, useCallback } from 'react'
import {
  Users, GitBranch, Calendar, TrendingUp, DollarSign,
  RefreshCw, Award, BarChart2, CreditCard, AlertCircle,
  Clock, ChevronRight, ChevronDown, Trash2, CheckCircle, XCircle,
  MessageSquare, AlertTriangle, Bell, ThumbsUp, ArrowRight,
  CalendarDays, Phone, WifiOff, CalendarPlus, X, Loader2, Bot, ClipboardList,
} from 'lucide-react'
import { getDashboardStats, getVendorPipeline, clearDashboard, getAgendadoraFollowup, getDashboardDetail, getAgentQueue } from '../api'
import { useAuthStore } from '../store/auth'
import { format, isToday, isTomorrow } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { Link, useNavigate } from 'react-router-dom'
import { EventModal } from '../components/EventModal'
import { STAGE_LABELS } from '../types'
import { parseDate as parseAsUTC, parseLocalDate } from '../utils/dates'

function fmt(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n)
}

const METRIC_LABELS: Record<string, string> = {
  active:         'Leads Activos',
  cierre_sin_abono: 'Cierre Sin Abono',
  cierre_abonado:   'Cierre Abonado',
  recovery:         'En Recuperación',
  cuotas:           'Leads con Cuotas',
  pagos_unicos:     'Pagos Únicos',
  honorarios:       'Monto Total',
}

function DashboardDetailModal({ metric, period, groupId, onClose }: {
  metric: string; period: string; groupId?: string; onClose: () => void
}) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    getDashboardDetail(metric, { period, group_id: groupId || undefined })
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [metric, period, groupId])

  const showMoney = ['cuotas', 'pagos_unicos', 'honorarios', 'cierre_abonado', 'cierre_sin_abono'].includes(metric)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-2)' }}>
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="font-bold text-base" style={{ color: 'var(--text)' }}>{METRIC_LABELS[metric] ?? metric}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{rows.length} registros</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg"
            style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary)' }} />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Sin datos para este período</div>
          ) : (
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Cliente</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Área</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Vendedor</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Etapa</th>
                  {showMoney && <>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Total</th>
                    {['cuotas','cierre_abonado'].includes(metric) && <th className="text-right px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Cuota</th>}
                  </>}
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)' }}>
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{r.contact_name}</p>
                      {r.contact_phone && <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{r.contact_phone}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-3)' }}>{r.area}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-3)' }}>{r.vendedor}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--surface-3)', color: 'var(--text-3)' }}>
                        {STAGE_LABELS[r.stage] ?? r.stage}
                      </span>
                    </td>
                    {showMoney && <>
                      <td className="px-4 py-2.5 text-right text-xs font-bold" style={{ color: 'var(--primary)' }}>
                        {fmt(r.honorarios)}
                      </td>
                      {['cuotas','cierre_abonado'].includes(metric) && (
                        <td className="px-4 py-2.5 text-right text-xs" style={{ color: 'var(--text-3)' }}>
                          {r.num_cuotas > 1 ? `${r.num_cuotas}×${fmt(r.monto_cuota)}` : '—'}
                        </td>
                      )}
                    </>}
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => { onClose(); navigate('/leads', { state: { openLeadId: r.id } }) }}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-lg"
                        style={{ background: 'var(--primary-dim)', color: 'var(--primary)' }}>
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {showMoney && rows.length > 0 && (
          <div className="px-5 py-3 flex items-center justify-between flex-shrink-0"
            style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Total</span>
            <span className="text-sm font-black" style={{ color: 'var(--primary)' }}>
              {fmt(rows.reduce((s, r) => s + r.honorarios, 0))}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function fmtAction(action: string) {
  const parts = action.split(' → ')
  if (parts.length === 2) return `${STAGE_LABELS[parts[0].trim()] || parts[0]} → ${STAGE_LABELS[parts[1].trim()] || parts[1]}`
  return STAGE_LABELS[action.trim()] || action
}

function eventDayLabel(iso: string) {
  const d = parseLocalDate(iso)
  if (isToday(d)) return 'Hoy'
  if (isTomorrow(d)) return 'Mañana'
  return format(d, "EEEE d 'de' MMMM", { locale: es })
}

function EventRow({ ev, onClick }: { ev: any; onClick?: () => void }) {
  const now = new Date()
  const start = parseLocalDate(ev.start_time)
  const isPast = start < now
  const isNow = start <= now && parseLocalDate(ev.end_time) > now

  // Color accent based on event type or vendor status
  const barColor = ev.vendor_status === 'altamente_interesado' ? '#a3e635'
    : ev.vendor_status === 'sin_exito' ? '#ff0055'
    : isNow ? '#00f0ff'
    : isPast ? 'var(--text-muted)'
    : '#a3e635'

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${onClick ? 'cursor-pointer hover:border-white/20 hover:bg-surface-0' : ''} ${
        isNow ? 'border-neon/25 bg-neon/[0.04]' : isPast ? 'border-white/[0.06] opacity-60' : 'border-white/[0.08] bg-surface-1'
      }`}
    >
      <div className="w-1.5 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: barColor }} />
      <div className="w-12 text-right flex-shrink-0">
        <p className={`text-xs font-bold ${isNow ? 'text-neon' : isPast ? 'text-white/52' : 'text-white/85'}`}>
          {format(start, 'HH:mm')}
        </p>
        {isNow && <p className="text-[9px] text-neon font-bold uppercase">Ahora</p>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white truncate">{ev.title}</p>
        {ev.contact_name && (
          <p className="text-[10px] text-white/55 flex items-center gap-1 mt-0.5 truncate">
            <Phone size={9} className="flex-shrink-0" />{ev.contact_name}
          </p>
        )}
      </div>
      {ev.vendor_status === 'altamente_interesado' && (
        <span className="text-[9px] font-bold text-lime bg-lime/15 border border-lime/25 px-1.5 py-0.5 rounded-full flex-shrink-0">Exitoso</span>
      )}
      {ev.vendor_status === 'sin_exito' && (
        <span className="text-[9px] font-bold text-danger bg-danger/15 border border-danger/25 px-1.5 py-0.5 rounded-full flex-shrink-0">Sin éxito</span>
      )}
      {!ev.vendor_status && isPast && (
        <span className="text-[9px] font-bold text-warn bg-warn/15 border border-warn/25 px-1.5 py-0.5 rounded-full flex-shrink-0">Sin marcar</span>
      )}
    </div>
  )
}

function AlertBanner({ icon: Icon, title, sub, to, color = 'warn', state }: { icon: any; title: string; sub: string; to: string; color?: 'warn' | 'danger' | 'neon'; state?: any }) {
  const c = {
    warn:   { outer: 'border-warn/20 bg-warn/[0.05] hover:bg-warn/[0.09]',     icon: 'bg-warn/15 text-warn' },
    danger: { outer: 'border-danger/20 bg-danger/[0.05] hover:bg-danger/[0.09]', icon: 'bg-danger/15 text-danger' },
    neon:   { outer: 'border-neon/20 bg-neon/[0.05] hover:bg-neon/[0.09]',     icon: 'bg-neon/15 text-neon' },
  }[color]
  return (
    <Link to={to} state={state} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${c.outer} text-white/90`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${c.icon}`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold leading-tight">{title}</p>
        <p className="text-[11px] opacity-70 mt-0.5">{sub}</p>
      </div>
      <ArrowRight size={14} className="flex-shrink-0 opacity-55" />
    </Link>
  )
}

const PIPELINE_STAGES = [
  { stage: 'lead',                 dot: 'bg-white/35',  label_color: 'text-white/65' },
  { stage: 'reunion',              dot: 'bg-blue-400',  label_color: 'text-blue-300/80' },
  { stage: 'altamente_interesado', dot: 'bg-violet-400',label_color: 'text-violet-300/80' },
  { stage: 'cierre',               dot: 'bg-neon',      label_color: 'text-neon/80' },
  { stage: 'pago_comprometido',    dot: 'bg-neon',      label_color: 'text-neon/80' },
  { stage: 'pagado_confirmado',    dot: 'bg-lime',      label_color: 'text-lime/90' },
]

type Period = 'day' | 'week' | 'month'
const PERIODS: { value: Period; label: string }[] = [
  { value: 'day',   label: 'Hoy' },
  { value: 'week',  label: 'Últimos 7 días' },
  { value: 'month', label: 'Mes' },
]

export default function Dashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState<any>(null)
  const [vendorPipeline, setVendorPipeline] = useState<any>(null)
  const [followupItems, setFollowupItems] = useState<any[]>([])
  const [agentQueueCount, setAgentQueueCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [showEventModal, setShowEventModal] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<any>(null)
  const [clearingActivity, setClearingActivity] = useState(false)
  const [period, setPeriod] = useState<Period>('month')
  const [periodOpen, setPeriodOpen] = useState(false)
  const [detailModal, setDetailModal] = useState<string | null>(null)

  const isVendedor  = user?.role === 'vendedor'
  const isSuperAdmin= user?.role === 'superadmin'
  const isSubAdmin  = user?.role === 'subadmin'
  const isAdmin     = isSuperAdmin || isSubAdmin
  const isDante     = user?.role === 'verificador'
  const isAgendadora= user?.role === 'agendadora'

  const fetchDashboard = useCallback(async (isSilent = false, overridePeriod?: Period) => {
    if (!isSilent) setLoading(true)
    try {
      const p = overridePeriod ?? period
      const params: any = { period: p }
      const calls: Promise<any>[] = [getDashboardStats(params)]
      let vpIdx = -1
      let fuIdx = -1
      let aqIdx = -1
      if (isVendedor)   { vpIdx = calls.length; calls.push(getVendorPipeline()) }
      if (isAgendadora) { fuIdx = calls.length; calls.push(getAgendadoraFollowup()) }
      if (isAgendadora) { aqIdx = calls.length; calls.push(getAgentQueue().catch(() => ({ count: 0, leads: [] }))) }
      const results = await Promise.all(calls)
      setStats(results[0])
      if (vpIdx >= 0) setVendorPipeline(results[vpIdx])
      if (fuIdx >= 0) setFollowupItems(results[fuIdx] ?? [])
      if (aqIdx >= 0) setAgentQueueCount(results[aqIdx]?.count ?? 0)
      setLastRefresh(new Date())
    } catch (e) {
      console.error(e)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }, [isVendedor, isAgendadora, period])

  useEffect(() => {
    fetchDashboard()
    const id = setInterval(() => fetchDashboard(true), 30000)
    return () => clearInterval(id)
  }, [fetchDashboard])

  const handleClearActivity = async () => {
    setClearingActivity(true)
    try {
      await clearDashboard()
      await fetchDashboard()
      toast.success('Actividad limpiada')
    } catch {
      toast.error('Error al limpiar')
    } finally {
      setClearingActivity(false)
    }
  }

  if (loading && !stats) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-2 border-lime border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!stats) return (
    <div className="p-8 text-center text-white/62">Error al cargar datos. Actualiza la página.</div>
  )

  const by = stats.by_stage ?? {}
  const total = stats.total_leads ?? 0
  const todayList: any[] = stats.today_events_list ?? []
  const pastUnmarked: any[] = stats.past_unmarked_events ?? []
  const recoveryCount: number = stats.recovery_count ?? 0
  const unreadMessages: number = stats.unread_messages ?? 0
  const firstUnreadLeadId: number | null = stats.first_unread_lead_id ?? null
  const leadsSinOT: number = stats.leads_sin_ot_count ?? 0

  const now = new Date()
  const todayPast   = todayList.filter(e => parseLocalDate(e.end_time) < now)
  const todayActive = todayList.filter(e => parseLocalDate(e.start_time) <= now && parseLocalDate(e.end_time) >= now)
  const todayFuture = todayList.filter(e => parseLocalDate(e.start_time) > now)

  const todayLabel = format(now, "EEEE d 'de' MMMM", { locale: es })

  // ── DANTE ──────────────────────────────────────────────────────
  if (isDante) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Dashboard</h1>
            <p className="text-xs text-white/62 mt-0.5 capitalize">
              {todayLabel} · Actualizado {format(lastRefresh, 'HH:mm')}
            </p>
          </div>
          <button onClick={() => fetchDashboard()} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-surface-1 border border-white/10 rounded-xl font-semibold text-sm hover:bg-surface-0">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>

        {(stats.pending_payments ?? 0) > 0 ? (
          <Link to="/pagos"
            className="flex items-center gap-4 p-6 bg-lime/[0.07] border border-lime/25 rounded-2xl hover:bg-lime/10 transition-all shadow-lime/10 shadow-md">
            <div className="w-14 h-14 rounded-2xl bg-lime/15 flex items-center justify-center flex-shrink-0">
              <CreditCard size={26} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-white/52 mb-1">Accion requerida</p>
              <p className="text-3xl font-black text-white leading-none">
                {stats.pending_payments} {stats.pending_payments === 1 ? 'pago pendiente' : 'pagos pendientes'}
              </p>
              <p className="text-sm text-white/52 mt-1">Haz clic para verificar ahora</p>
            </div>
            <ChevronRight size={20} className="text-white/62 flex-shrink-0" />
          </Link>
        ) : (
          <div className="flex items-center gap-4 p-6 bg-surface-0 border border-white/10 rounded-2xl">
            <div className="w-14 h-14 rounded-2xl bg-lime/15 flex items-center justify-center flex-shrink-0">
              <CheckCircle size={26} className="text-white/62" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/52 mb-1">Al dia</p>
              <p className="text-2xl font-black text-white/90">Sin pagos pendientes</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-warn/[0.06] rounded-2xl border border-warn/20 p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/52 mb-1">Por verificar</p>
            <p className="text-4xl font-black text-warn">{stats.pending_payments ?? 0}</p>
          </div>
          <div className="bg-lime/[0.06] rounded-2xl border border-lime/20 p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/52 mb-1">Confirmados</p>
            <p className="text-4xl font-black text-lime">{stats.confirmed_payments ?? 0}</p>
          </div>
          <div className="bg-danger/[0.06] rounded-2xl border border-danger/20 p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/52 mb-1">Rechazados</p>
            <p className="text-4xl font-black text-danger">{stats.rejected_payments ?? 0}</p>
          </div>
        </div>

        {stats.payments_by_group?.length > 0 && (
          <div className="bg-surface-1 rounded-2xl border border-white/10 shadow-sm p-5">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Bell size={15} className="text-warn/70" /> Pendientes por grupo
            </h2>
            <div className="space-y-2">
              {stats.payments_by_group.map((g: any) => (
                <Link key={g.id} to={`/pagos?group_id=${g.id}`}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-0 border border-white/[0.07] hover:bg-surface-2 transition-colors group">
                  <p className="flex-1 text-sm font-semibold text-white/90">{g.name}</p>
                  <span className="text-sm font-bold text-white/85">{g.pending} {g.pending === 1 ? 'pago' : 'pagos'}</span>
                  <ChevronRight size={14} className="text-white/52" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── VENDEDOR ───────────────────────────────────────────────────
  if (isVendedor) {
    const pendingMarkCount: number = stats.past_unmarked_count ?? 0
    const espera: number = vendorPipeline?.espera_cliente?.length ?? 0

    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Dashboard</h1>
            <p className="text-xs text-white/62 mt-0.5 capitalize">
              {todayLabel} · Actualizado {format(lastRefresh, 'HH:mm')}
            </p>
          </div>
          <button onClick={() => fetchDashboard()} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-surface-1 border border-white/10 rounded-xl font-semibold text-sm hover:bg-surface-0">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>

        {/* Alertas urgentes */}
        {(pendingMarkCount > 0 || leadsSinOT > 0) && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/52">Requiere tu atencion</p>
            {pendingMarkCount > 0 && (
              <AlertBanner
                icon={AlertTriangle}
                title={`${pendingMarkCount} reunion${pendingMarkCount > 1 ? 'es' : ''} sin marcar`}
                sub="Tienes reuniones pasadas que no marcaste como Exitosas o Sin exito"
                to="/mi-pipeline"
                color="warn"
              />
            )}
            {leadsSinOT > 0 && (
              <AlertBanner
                icon={ClipboardList}
                title={`${leadsSinOT} lead${leadsSinOT > 1 ? 's' : ''} sin Orden de Trabajo`}
                sub="Tienes leads en Cierre sin OT — créala antes de avanzar"
                to="/mi-pipeline?sin_ot=1"
                color="danger"
              />
            )}
          </div>
        )}

        {/* KPIs rapidos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link to="/mi-pipeline"
            className="bg-warn/[0.06] border border-warn/15 rounded-xl p-4 text-center hover:bg-warn/[0.10] transition-colors">
            <p className="text-4xl font-black text-warn">{espera}</p>
            <p className="text-[10px] text-white/60 font-semibold mt-1">En espera</p>
          </Link>
          <Link to="/mi-pipeline"
            className="bg-lime/[0.06] border border-lime/15 rounded-xl p-4 text-center hover:bg-lime/[0.10] transition-colors">
            <p className="text-4xl font-black text-lime">{vendorPipeline?.altamente_interesado?.length ?? 0}</p>
            <p className="text-[10px] text-white/60 font-semibold mt-1">Exitosos</p>
          </Link>
          <Link to="/agenda"
            className="bg-neon/[0.06] border border-neon/15 rounded-xl p-4 text-center hover:bg-neon/[0.10] transition-colors">
            <p className="text-4xl font-black text-neon">{todayList.length}</p>
            <p className="text-[10px] text-white/60 font-semibold mt-1">Hoy</p>
          </Link>
          <Link to="/mi-pipeline"
            className="bg-danger/[0.06] border border-danger/15 rounded-xl p-4 text-center hover:bg-danger/[0.10] transition-colors">
            <p className="text-4xl font-black text-danger">{pendingMarkCount}</p>
            <p className="text-[10px] text-white/60 font-semibold mt-1">Sin marcar</p>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Agenda de hoy */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-surface-1 rounded-2xl border border-white/10 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <CalendarDays size={15} className="text-white/52" />
                  <span className="capitalize">Hoy — {format(now, "d 'de' MMMM", { locale: es })}</span>
                </h2>
                <Link to="/agenda" className="text-xs text-white/52 hover:text-white/85 flex items-center gap-1">
                  Agenda completa <ChevronRight size={11} />
                </Link>
              </div>

              {todayList.length === 0 ? (
                <div className="py-8 text-center">
                  <CalendarDays size={28} className="mx-auto text-white/15 mb-2" />
                  <p className="text-xs text-white/52">Sin reuniones programadas para hoy</p>
                  <Link to="/agenda" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-white/78 hover:underline">
                    Ir a agenda <ChevronRight size={11} />
                  </Link>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {[...todayActive, ...todayFuture, ...todayPast].map(ev => (
                    <EventRow key={ev.id} ev={ev} onClick={() => { setSelectedEvent(ev); setShowEventModal(true) }} />
                  ))}
                </div>
              )}
            </div>

            {/* Reuniones sin marcar */}
            {pastUnmarked.length > 0 && (
              <div className="bg-surface-1 rounded-2xl border border-white/10 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-sm flex items-center gap-2 text-white/85">
                    <AlertTriangle size={15} className="text-white/52" />
                    Reuniones pasadas sin marcar
                  </h2>
                  <Link to="/mi-pipeline" className="text-xs font-semibold text-white/78 hover:text-white flex items-center gap-1">
                    Marcar ahora <ChevronRight size={11} />
                  </Link>
                </div>
                <div className="space-y-1.5">
                  {pastUnmarked.slice(0, 5).map((ev: any) => (
                    <div key={ev.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-0 border border-white/[0.07]">
                      <AlertTriangle size={13} className="text-white/52 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white/90 truncate">{ev.title}</p>
                        <p className="text-[10px] text-white/62">
                          {ev.contact_name && <>{ev.contact_name} · </>}
                          {format(parseLocalDate(ev.start_time), "d MMM, HH:mm", { locale: es })}
                        </p>
                      </div>
                      <Link to="/mi-pipeline" className="text-[10px] font-bold text-white/78 hover:text-white flex-shrink-0">
                        Marcar
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Columna derecha: Mi Pipeline + Actividad */}
          <div className="lg:col-span-2 space-y-4">
            {/* Mi Pipeline mini */}
            <div className="bg-surface-1 rounded-2xl border border-white/10 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <GitBranch size={15} className="text-lime/70" /> Mi Pipeline
                </h2>
                <Link to="/mi-pipeline" className="text-xs text-white/52 hover:text-white/85 flex items-center gap-1">
                  Ver completo <ChevronRight size={11} />
                </Link>
              </div>
              <div className="space-y-2">
                {(['lead','reunion','altamente_interesado','cierre','pago_comprometido'] as const).map(stage => {
                  const count = by[stage] ?? 0
                  const dotColor = stage === 'pago_comprometido' ? 'bg-neon' : stage === 'cierre' ? 'bg-cyan-400' : stage === 'altamente_interesado' ? 'bg-violet-400' : stage === 'reunion' ? 'bg-blue-400' : 'bg-white/35'
                  return (
                    <Link key={stage} to="/pipeline" className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface-0 border border-white/[0.07] hover:bg-surface-2 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                        <span className="text-xs font-semibold text-white/85">{STAGE_LABELS[stage]}</span>
                      </div>
                      <span className="text-sm font-bold text-white/85">{count}</span>
                    </Link>
                  )
                })}
                {recoveryCount > 0 && (
                  <Link to="/pipeline" className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface-0 border border-danger/20 hover:bg-surface-2 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-danger" />
                      <span className="text-xs font-semibold text-danger/85">Recuperación</span>
                    </div>
                    <span className="text-sm font-bold text-danger/85">{recoveryCount}</span>
                  </Link>
                )}
              </div>
            </div>

            {/* Actividad reciente */}
            <div className="bg-surface-1 rounded-2xl border border-white/10 shadow-sm p-5">
              <h2 className="font-semibold text-sm flex items-center gap-2 mb-3">
                <Clock size={15} className="text-neon/70" /> Actividad reciente
              </h2>
              <div className="space-y-2 max-h-[280px] overflow-y-auto">
                {stats.recent_activity?.length > 0 ? stats.recent_activity.map((a: any) => (
                  <div key={a.id} className="p-2.5 bg-surface-0 rounded-xl border border-white/[0.07]">
                    <p className="text-[11px] text-white/95">
                      <span className="font-bold">{a.user}</span>
                      {' · '}
                      <span className="text-white/62">{fmtAction(a.action)}</span>
                    </p>
                    <p className="text-[9px] text-white/65 mt-0.5">
                      {a.contact_name} · {format(parseAsUTC(a.time), "d MMM HH:mm", { locale: es })}
                    </p>
                  </div>
                )) : (
                  <p className="text-center py-6 text-[10px] text-white/38">Sin actividad registrada.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {showEventModal && (
          <EventModal
            event={selectedEvent}
            vendors={[]}
            onClose={() => setShowEventModal(false)}
            onSaved={() => { setShowEventModal(false); fetchDashboard() }}
          />
        )}
        {detailModal && (
          <DashboardDetailModal
            metric={detailModal}
            period={period}
            onClose={() => setDetailModal(null)}
          />
        )}
      </div>
    )
  }

  // ── AGENDADORA ─────────────────────────────────────────────────
  if (isAgendadora) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Dashboard</h1>
            <p className="text-xs text-white/62 mt-0.5 capitalize">
              {todayLabel} · Actualizado {format(lastRefresh, 'HH:mm')}
            </p>
          </div>
          <button onClick={() => fetchDashboard()} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-surface-1 border border-white/10 rounded-xl font-semibold text-sm hover:bg-surface-0">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>

        {/* Alertas urgentes */}
        {(recoveryCount > 0 || unreadMessages > 0 || stats.cold_leads_count > 0 || agentQueueCount > 0 || leadsSinOT > 0) && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/52">Requiere atencion</p>
            {agentQueueCount > 0 && (
              <Link to="/agente-ia" className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-white/90"
                style={{ borderColor: 'rgba(67,97,238,0.25)', background: 'rgba(67,97,238,0.07)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(67,97,238,0.13)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(67,97,238,0.07)'}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(67,97,238,0.15)', color: '#4361ee' }}>
                  <Bot size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold leading-tight">{agentQueueCount} lead{agentQueueCount > 1 ? 's' : ''} captado{agentQueueCount > 1 ? 's' : ''} por Agente IA</p>
                  <p className="text-[11px] opacity-70 mt-0.5">Clientes atendidos fuera de horario — revisar y dar seguimiento</p>
                </div>
                <ArrowRight size={14} className="flex-shrink-0 opacity-55" />
              </Link>
            )}
            {leadsSinOT > 0 && (
              <AlertBanner
                icon={ClipboardList}
                title={`${leadsSinOT} lead${leadsSinOT > 1 ? 's' : ''} sin Orden de Trabajo`}
                sub="Leads en Cierre sin OT — vendedor debe crear OT antes de avanzar"
                to="/pipeline?sin_ot=1"
                color="danger"
              />
            )}
            {recoveryCount > 0 && (
              <AlertBanner
                icon={AlertTriangle}
                title={`${recoveryCount} lead${recoveryCount > 1 ? 's' : ''} en recuperacion`}
                sub="Casos que necesitan seguimiento urgente — agenda una nueva reunion"
                to="/leads"
                color="danger"
              />
            )}
            {stats.cold_leads_count > 0 && (
              <AlertBanner
                icon={Clock}
                title={`${stats.cold_leads_count} lead${stats.cold_leads_count > 1 ? 's' : ''} sin interacción hace más de 3 días`}
                sub="No hubo ninguna acción sobre estos leads en los últimos 3 días"
                to="/leads"
                color="warn"
              />
            )}
            {unreadMessages > 0 && isAgendadora && (
              <AlertBanner
                icon={MessageSquare}
                title={`${unreadMessages} mensaje${unreadMessages > 1 ? 's' : ''} sin leer`}
                sub="Clientes esperando respuesta en WhatsApp"
                to={firstUnreadLeadId ? '/leads' : '/whatsapp'}
                state={firstUnreadLeadId ? { openLeadId: firstUnreadLeadId } : undefined}
                color="neon"
              />
            )}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-surface-1 border border-white/10 rounded-xl p-4 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/52 mb-1">Total leads</p>
            <p className="text-4xl font-black text-white">{total}</p>
          </div>
          <div className="bg-lime/[0.06] border border-lime/15 rounded-xl p-4 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/52 mb-1">Nuevos hoy</p>
            <p className="text-4xl font-black text-lime">{stats.today_leads ?? 0}</p>
          </div>
          <div className="bg-danger/[0.06] border border-danger/15 rounded-xl p-4 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/52 mb-1">En recuperacion</p>
            <p className="text-4xl font-black text-danger">{recoveryCount}</p>
          </div>
          <div className="bg-neon/[0.06] border border-neon/15 rounded-xl p-4 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/52 mb-1">Hoy en agenda</p>
            <p className="text-4xl font-black text-neon">{todayList.length}</p>
          </div>
        </div>

        {/* Seguimiento — reuniones que necesitan reagendarse */}
        {followupItems.length > 0 && (
          <div className="bg-surface-1 rounded-2xl border border-white/10 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <AlertTriangle size={15} className="text-warn/70" />
                Reuniones sin éxito — reagendar
                <span className="ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-warn/15 text-warn">{followupItems.length}</span>
              </h2>
              <Link to="/seguimiento" className="text-xs text-white/52 hover:text-white/85 flex items-center gap-1">
                Ver todos <ChevronRight size={11} />
              </Link>
            </div>
            <div className="space-y-2">
              {followupItems.slice(0, 5).map((item: any) => (
                <div key={item.id}
                  className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors ${
                    item.vendor_status === 'no_show'
                      ? 'bg-warn/[0.04] border-warn/15'
                      : 'bg-danger/[0.04] border-danger/15'
                  }`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    item.vendor_status === 'no_show' ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger'
                  }`}>
                    {item.vendor_status === 'no_show' ? <WifiOff size={13} /> : <XCircle size={13} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-white/90 truncate">{item.contact_name ?? item.title}</p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        item.vendor_status === 'no_show' ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger'
                      }`}>
                        {item.vendor_status === 'no_show' ? 'No se conectó' : 'Se conectó y no cerró'}
                      </span>
                    </div>
                    {item.vendor_name && (
                      <p className="text-[10px] text-white/45 mt-0.5">Vendedor: {item.vendor_name}</p>
                    )}
                    {item.outcome_note && (
                      <p className="text-[11px] text-white/62 mt-1 leading-relaxed italic">"{item.outcome_note}"</p>
                    )}
                    <p className="text-[10px] text-white/38 mt-0.5">
                      {format(new Date(item.start_time), "d MMM yyyy · HH:mm", { locale: es })}
                    </p>
                  </div>
                  {item.lead_id && (
                    <button
                      onClick={() => navigate('/leads', { state: { openLeadId: item.lead_id } })}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-lime/10 text-lime border border-lime/20 text-[10px] font-bold hover:bg-lime/20 transition-colors flex-shrink-0 mt-0.5">
                      Ver <ArrowRight size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {followupItems.length > 5 && (
              <Link to="/seguimiento"
                className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-semibold text-white/52 hover:text-white/85 hover:bg-white/[0.04] border border-white/[0.07] transition-colors">
                Ver todos ({followupItems.length}) <ChevronRight size={11} />
              </Link>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Agenda del dia */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-surface-1 rounded-2xl border border-white/10 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <CalendarDays size={15} className="text-white/52" />
                  <span className="capitalize">Hoy — {format(now, "d 'de' MMMM", { locale: es })}</span>
                </h2>
                <Link to="/calendario" className="text-xs text-white/52 hover:text-white/85 flex items-center gap-1">
                  Calendario <ChevronRight size={11} />
                </Link>
              </div>
              {todayList.length === 0 ? (
                <div className="py-8 text-center">
                  <CalendarDays size={28} className="mx-auto text-white/15 mb-2" />
                  <p className="text-xs text-white/52">Sin reuniones programadas para hoy</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {[...todayActive, ...todayFuture, ...todayPast].map(ev => (
                    <EventRow key={ev.id} ev={ev} onClick={() => { setSelectedEvent(ev); setShowEventModal(true) }} />
                  ))}
                </div>
              )}
            </div>

            {/* Pipeline del grupo */}
            <div className="bg-surface-1 rounded-2xl border border-white/10 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <GitBranch size={15} className="text-lime/70" /> Pipeline del Grupo
                </h2>
                <Link to="/pipeline" className="text-xs text-white/52 hover:text-white/85 flex items-center gap-1">
                  Ver completo <ChevronRight size={11} />
                </Link>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
                {PIPELINE_STAGES.map(({ stage, dot, label_color }) => (
                  <Link key={stage} to="/pipeline"
                    className="flex flex-col items-center bg-surface-0 rounded-xl p-3 border border-white/[0.07] hover:border-white/10 hover:bg-surface-2 transition-colors text-center">
                    <p className="text-xl font-bold text-white">{by[stage] ?? 0}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                      <p className={`text-[9px] leading-tight font-semibold ${label_color}`}>{STAGE_LABELS[stage]}</p>
                    </div>
                  </Link>
                ))}
              </div>
              {recoveryCount > 0 && (
                <Link to="/pipeline"
                  className="flex items-center gap-2 bg-surface-0 rounded-xl px-4 py-2.5 border border-white/10 hover:bg-surface-2 transition-colors">
                  <span className="w-2 h-2 rounded-full bg-white/30 flex-shrink-0" />
                  <span className="text-xs text-white/78 font-semibold">Recuperacion</span>
                  <span className="ml-auto text-sm font-bold text-white/85">{recoveryCount}</span>
                  <ChevronRight size={12} className="text-white/52" />
                </Link>
              )}
            </div>
          </div>

          {/* Columna derecha: actividad */}
          <div className="lg:col-span-2">
            <div className="bg-surface-1 rounded-2xl border border-white/10 shadow-sm p-5 h-full">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Clock size={15} className="text-neon/70" /> Actividad reciente
                </h2>
                <button onClick={handleClearActivity} disabled={clearingActivity || !stats.recent_activity?.length}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white/52 hover:text-danger border border-white/10 hover:border-danger/30 rounded-lg transition-colors disabled:opacity-30">
                  <Trash2 size={10} /> Limpiar
                </button>
              </div>
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {stats.recent_activity?.length > 0 ? stats.recent_activity.map((a: any) => (
                  <div key={a.id} className="p-2.5 bg-surface-0 rounded-xl border border-white/[0.07]">
                    <p className="text-[11px] text-white/95">
                      <span className="font-bold">{a.user}</span>
                      {' · '}
                      <span className="text-white/62">{fmtAction(a.action)}</span>
                    </p>
                    <p className="text-[9px] text-white/65 mt-0.5">
                      {a.contact_name} · {format(parseAsUTC(a.time), "d MMM HH:mm", { locale: es })}
                    </p>
                  </div>
                )) : (
                  <p className="text-center py-8 text-[10px] text-white/38">Sin actividad registrada hoy.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {showEventModal && (
          <EventModal
            event={selectedEvent}
            vendors={[]}
            onClose={() => setShowEventModal(false)}
            onSaved={() => { setShowEventModal(false); fetchDashboard() }}
          />
        )}
      </div>
    )
  }

  // ── ADMIN (superadmin / subadmin) ──────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-xs text-white/62 mt-0.5 capitalize">
            {todayLabel} · Actualizado {format(lastRefresh, 'HH:mm')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period dropdown */}
          <div className="relative">
            <button
              onClick={() => setPeriodOpen(o => !o)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all border border-lime/40 bg-lime/10 text-lime hover:bg-lime/20 hover:border-lime/70"
            >
              <Calendar size={13} />
              <span className="font-bold">
                {PERIODS.find(p => p.value === period)?.label}
              </span>
              <ChevronDown size={13} className={`transition-transform duration-200 ${periodOpen ? 'rotate-180' : ''}`} />
            </button>
            {periodOpen && (
              <div
                className="absolute right-0 mt-2 w-44 rounded-2xl z-50 overflow-hidden"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1.5px solid rgba(204,255,0,0.35)',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 20px rgba(204,255,0,0.08)',
                }}
              >
                <div className="px-3 pt-3 pb-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-lime/60">Período</p>
                </div>
                {PERIODS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => {
                      setPeriod(value)
                      setPeriodOpen(false)
                      fetchDashboard(false, value)
                    }}
                    className={`w-full text-left px-3 py-2.5 text-sm font-medium transition-all flex items-center justify-between gap-2 ${
                      period === value
                        ? 'text-black bg-lime font-bold'
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{label}</span>
                    {period === value && <CheckCircle size={13} />}
                  </button>
                ))}
                <div className="h-2" />
              </div>
            )}
          </div>
          <button onClick={() => fetchDashboard()} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-surface-1 border border-white/10 rounded-xl font-semibold text-sm hover:bg-surface-0">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      {/* Alertas urgentes */}
      {(recoveryCount > 0 || stats.cold_leads_count > 0 || (unreadMessages > 0 && isAgendadora) || (stats.pending_payments ?? 0) > 0 || leadsSinOT > 0) && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/52">Alertas del sistema</p>
          {leadsSinOT > 0 && (
            <AlertBanner
              icon={ClipboardList}
              title={`${leadsSinOT} lead${leadsSinOT > 1 ? 's' : ''} sin Orden de Trabajo`}
              sub="Leads en Cierre sin OT — vendedores deben actuar"
              to="/pipeline?sin_ot=1"
              color="danger"
            />
          )}
          {(stats.pending_payments ?? 0) > 0 && (
            <AlertBanner
              icon={CreditCard}
              title={`${stats.pending_payments} pago${stats.pending_payments > 1 ? 's' : ''} esperando verificacion`}
              sub="Dante debe revisar estos pagos"
              to="/pagos"
              color="warn"
            />
          )}
          {recoveryCount > 0 && (
            <AlertBanner
              icon={AlertTriangle}
              title={`${recoveryCount} lead${recoveryCount > 1 ? 's' : ''} en recuperacion`}
              sub="Casos con reuniones fallidas que necesitan nueva accion"
              to="/pipeline"
              color="danger"
            />
          )}
          {stats.cold_leads_count > 0 && (
            <AlertBanner
              icon={Clock}
              title={`${stats.cold_leads_count} lead${stats.cold_leads_count > 1 ? 's' : ''} sin interacción hace más de 3 días`}
              sub="No hubo ninguna acción sobre estos leads en los últimos 3 días"
              to="/leads"
              color="warn"
            />
          )}
          {unreadMessages > 0 && isAgendadora && (
            <AlertBanner
              icon={MessageSquare}
              title={`${unreadMessages} mensaje${unreadMessages > 1 ? 's' : ''} de WhatsApp sin leer`}
              sub="Clientes esperando respuesta"
              to={firstUnreadLeadId ? '/leads' : '/whatsapp'}
              state={firstUnreadLeadId ? { openLeadId: firstUnreadLeadId } : undefined}
              color="neon"
            />
          )}
        </div>
      )}

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button onClick={() => setDetailModal('active')}
          className="bg-lime/[0.07] border border-lime/20 rounded-2xl p-5 shadow-sm hover:bg-lime/[0.12] transition-colors text-left">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/52 mb-1">Leads activos</p>
          <p className="text-4xl font-black text-lime">{total}</p>
          <p className="text-[10px] text-white/55 mt-1">+{stats.today_leads ?? 0} hoy</p>
        </button>
        <div className="bg-neon/[0.06] border border-neon/20 rounded-2xl p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/52 mb-1">Conversion</p>
          <p className="text-4xl font-black text-neon">{stats.conversion_rate ?? 0}%</p>
          <p className="text-[10px] text-white/55 mt-1">{(stats.cierre_sin_abono ?? 0) + (stats.cierre_abonado ?? 0)} en cierre o más</p>
        </div>
        <button onClick={() => setDetailModal('cuotas')}
          className="bg-surface-1 rounded-2xl border border-white/10 p-5 shadow-sm hover:bg-surface-2 transition-colors text-left">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/52 mb-1">Total cuotas</p>
          <p className="text-xl font-black text-white truncate">{fmt(stats.total_cuotas ?? 0)}</p>
          <p className="text-[10px] text-white/55 mt-1">suma de planes de cuotas</p>
        </button>
        <button onClick={() => setDetailModal('honorarios')}
          className="bg-surface-1 rounded-2xl border border-white/10 p-5 shadow-sm hover:bg-surface-2 transition-colors text-left">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/52 mb-1">Monto Total</p>
          <p className="text-xl font-black text-white truncate">{fmt(stats.total_honorarios ?? 0)}</p>
          <p className="text-[10px] text-white/55 mt-1">total comprometido en cierre y pago</p>
        </button>
      </div>

      {/* Cierre + Recuperación cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <button onClick={() => setDetailModal('cierre_sin_abono')}
          className="bg-neon/[0.04] border border-neon/15 rounded-2xl p-5 shadow-sm hover:bg-neon/[0.08] transition-colors text-left">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/52 mb-1">Cierre sin abono</p>
          <p className="text-4xl font-black text-neon">{stats.cierre_sin_abono ?? 0}</p>
          <p className="text-[10px] text-white/55 mt-1">en etapa cierre, pendiente pago</p>
        </button>
        <button onClick={() => setDetailModal('cierre_abonado')}
          className="bg-lime/[0.04] border border-lime/15 rounded-2xl p-5 shadow-sm hover:bg-lime/[0.08] transition-colors text-left">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/52 mb-1">Cierre abonado</p>
          <p className="text-4xl font-black text-lime">{stats.cierre_abonado ?? 0}</p>
          <p className="text-[10px] text-white/55 mt-1">pago comprometido + confirmado</p>
        </button>
        <button onClick={() => setDetailModal('recovery')}
          className="bg-danger/[0.06] border border-danger/20 rounded-2xl p-5 shadow-sm hover:bg-danger/[0.10] transition-colors text-left">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/52 mb-1">En recuperacion</p>
          <p className="text-4xl font-black text-danger">{recoveryCount}</p>
          <p className="text-[10px] text-white/55 mt-1">casos con seguimiento pendiente</p>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Izquierda: Pipeline + Hoy + Grupos */}
        <div className="lg:col-span-2 space-y-5">

          {/* Pipeline completo */}
          <div className="bg-surface-1 rounded-2xl border border-white/10 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <GitBranch size={15} className="text-lime/70" /> Estado del Pipeline
              </h2>
              <Link to="/pipeline" className="text-xs text-white/52 hover:text-white/85 flex items-center gap-1">
                Ver detalle <ChevronRight size={11} />
              </Link>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
              {PIPELINE_STAGES.map(({ stage, dot, label_color }) => (
                <Link key={stage} to="/pipeline"
                  className="flex flex-col items-center bg-surface-0 rounded-xl p-3 border border-white/[0.07] hover:border-white/10 hover:bg-surface-2 transition-colors text-center">
                  <p className="text-xl font-bold text-white">{by[stage] ?? 0}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                    <p className={`text-[9px] leading-tight font-semibold ${label_color}`}>{STAGE_LABELS[stage]}</p>
                  </div>
                </Link>
              ))}
            </div>
            {recoveryCount > 0 && (
              <Link to="/pipeline"
                className="flex items-center gap-2 bg-surface-0 rounded-xl px-4 py-2.5 border border-white/10 hover:bg-surface-2 transition-colors">
                <span className="w-2 h-2 rounded-full bg-white/30 flex-shrink-0" />
                <span className="text-xs text-white/78 font-semibold">Recuperacion</span>
                <span className="ml-auto text-sm font-bold text-white/85">{recoveryCount}</span>
                <ChevronRight size={12} className="text-white/52" />
              </Link>
            )}
          </div>

          {/* Hoy en el sistema */}
          {todayList.length > 0 && (
            <div className="bg-surface-1 rounded-2xl border border-white/10 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <CalendarDays size={15} className="text-white/52" />
                  Reuniones de hoy ({todayList.length})
                </h2>
                <Link to="/calendario" className="text-xs text-white/52 hover:text-white/85 flex items-center gap-1">
                  Calendario <ChevronRight size={11} />
                </Link>
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {[...todayActive, ...todayFuture, ...todayPast].map(ev => (
                  <EventRow key={ev.id} ev={ev} />
                ))}
              </div>
            </div>
          )}

          {/* Por grupo */}
          {stats.by_group?.length > 0 && (
            <div className="bg-surface-1 rounded-2xl border border-black/[0.06] shadow-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--text)' }}>
                  <BarChart2 size={15} className="text-lime" /> Rendimiento por Grupo
                </h2>
                <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>leads · pagados</span>
              </div>
              <div className="space-y-3">
                {stats.by_group.map((g: any) => (
                  <div key={g.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold truncate max-w-[9rem]" style={{ color: 'var(--text)' }}>{g.name}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{g.total}</span>
                        {g.pagado > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                            style={{ background: 'rgba(67,97,238,0.10)', color: '#4361ee' }}>
                            {g.pagado} pag.
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: '#edf2f7' }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: total > 0 ? `${Math.max(Math.round(g.total / total * 100), g.total > 0 ? 4 : 0)}%` : '0%',
                          background: 'linear-gradient(90deg, #4361ee, #3a86ff)'
                        }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Derecha: Top vendedores + Actividad */}
        <div className="space-y-5">
          {stats.top_vendedores?.length > 0 && (
            <div className="bg-surface-1 rounded-2xl border border-white/10 shadow-sm p-5">
              <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Award size={15} className="text-warn/70" /> Vendedores
                <span className="ml-auto text-[10px] text-white/52 font-normal">cierres</span>
              </h2>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {stats.top_vendedores.slice(0, 8).map((v: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 bg-surface-0 rounded-xl border border-white/[0.07] hover:border-white/12 transition-colors">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0"
                      style={{
                        background: i === 0 ? 'rgba(163,230,53,0.20)' : i === 1 ? 'var(--surface-3)' : i === 2 ? 'rgba(255,166,0,0.18)' : 'var(--surface-3)',
                        color: i === 0 ? '#a3e635' : i === 1 ? 'var(--text)' : i === 2 ? '#ffa600' : 'var(--text-muted)',
                      }}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-white truncate leading-none mb-0.5">{v.name}</p>
                      <p className="text-[9px] text-white/52 truncate">{v.group}</p>
                    </div>
                    <div className="text-sm font-black flex-shrink-0"
                      style={{ color: i === 0 ? '#a3e635' : i < 3 ? 'var(--text)' : 'var(--text-2)' }}>
                      {v.closed}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-surface-1 rounded-2xl border border-white/10 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Clock size={15} className="text-neon/70" /> Actividad Reciente
              </h2>
              <button onClick={handleClearActivity} disabled={clearingActivity || !stats.recent_activity?.length}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white/52 hover:text-danger border border-white/10 hover:border-danger/30 rounded-lg transition-colors disabled:opacity-30">
                <Trash2 size={10} /> Limpiar
              </button>
            </div>
            <div className="space-y-2 max-h-[360px] overflow-y-auto">
              {stats.recent_activity?.length > 0 ? stats.recent_activity.map((a: any) => (
                <div key={a.id} className="p-2.5 bg-surface-0 rounded-xl border border-white/[0.07]">
                  <p className="text-[11px] text-white/95 leading-normal">
                    <span className="font-bold">{a.user}</span>
                    {' · '}
                    <span className="text-white/62">{fmtAction(a.action)}</span>
                  </p>
                  <p className="text-[9px] text-white/65 mt-0.5">
                    {a.contact_name} · {format(parseAsUTC(a.time), "d MMM HH:mm", { locale: es })}
                  </p>
                </div>
              )) : (
                <p className="text-center py-6 text-[10px] text-white/38">Sin actividad reciente.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {detailModal && (
        <DashboardDetailModal
          metric={detailModal}
          period={period}
          onClose={() => setDetailModal(null)}
        />
      )}
    </div>
  )
}
