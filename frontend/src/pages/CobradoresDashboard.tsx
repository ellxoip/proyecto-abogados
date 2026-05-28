import { useState, useEffect } from 'react'
import { getCobradorDashboard } from '../api'
import { TrendingUp, Users, DollarSign, AlertCircle, CheckCircle, Phone, Handshake, Ban } from 'lucide-react'

const STAGES: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  por_contactar: { label: 'Por Contactar', color: '#6B7280', icon: Phone },
  contactado:    { label: 'Contactado',    color: '#3B82F6', icon: Phone },
  negociando:    { label: 'Negociando',    color: '#F59E0B', icon: Handshake },
  acuerdo_pago:  { label: 'Acuerdo Pago', color: '#8B5CF6', icon: Handshake },
  pagado:        { label: 'Pagado',        color: '#10B981', icon: CheckCircle },
  incobrable:    { label: 'Incobrable',    color: '#EF4444', icon: Ban },
}

function fmt(n: number) {
  return `$${Math.round(n).toLocaleString('es-CL')}`
}

export default function CobradoresDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCobradorDashboard()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
    </div>
  )

  const totalDeuda   = stats?.total_deuda   ?? 0
  const totalCobrado = stats?.total_cobrado ?? 0
  const porStage     = stats?.por_stage     ?? {}
  const tasa         = stats?.tasa_cobro    ?? 0

  const kpis = [
    { label: 'Total Cartera',    value: fmt(totalDeuda),   icon: DollarSign, color: '#4361ee', bg: 'rgba(67,97,238,0.10)' },
    { label: 'Total Cobrado',    value: fmt(totalCobrado), icon: TrendingUp,  color: '#10B981', bg: 'rgba(16,185,129,0.10)' },
    { label: 'Tasa de Cobro',    value: `${tasa}%`,        icon: CheckCircle, color: '#8B5CF6', bg: 'rgba(139,92,246,0.10)' },
    { label: 'Total Clientes',   value: String(stats?.total_leads ?? 0), icon: Users, color: '#F59E0B', bg: 'rgba(245,158,11,0.10)' },
  ]

  const pendiente = totalDeuda - totalCobrado
  const pct = totalDeuda > 0 ? (totalCobrado / totalDeuda) * 100 : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-black" style={{ color: 'var(--text)', fontFamily: '"Space Grotesk", sans-serif' }}>
          Dashboard Cobranza
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Resumen de tu cartera de clientes
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid rgba(26,32,53,0.10)', boxShadow: '0 2px 8px rgba(26,32,53,0.05)' }}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: k.bg }}>
                  <Icon size={18} style={{ color: k.color }} />
                </div>
              </div>
              <p className="text-2xl font-black leading-tight" style={{ color: 'var(--text)', fontFamily: '"Space Grotesk", sans-serif' }}>
                {k.value}
              </p>
              <p className="text-xs mt-1 font-medium" style={{ color: 'var(--text-muted)' }}>{k.label}</p>
            </div>
          )
        })}
      </div>

      {/* Progress bar */}
      <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid rgba(26,32,53,0.10)', boxShadow: '0 2px 8px rgba(26,32,53,0.05)' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm" style={{ color: 'var(--text)' }}>Progreso de Cobro</h3>
          <span className="text-xs font-semibold" style={{ color: '#10B981' }}>{pct.toFixed(1)}% cobrado</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(26,32,53,0.08)' }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(pct, 100)}%`, background: 'linear-gradient(90deg, #10B981 0%, #34d399 100%)' }} />
        </div>
        <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>Cobrado: {fmt(totalCobrado)}</span>
          <span>Pendiente: {fmt(pendiente)}</span>
        </div>
      </div>

      {/* Stage breakdown */}
      <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid rgba(26,32,53,0.10)', boxShadow: '0 2px 8px rgba(26,32,53,0.05)' }}>
        <h3 className="font-bold text-sm mb-4" style={{ color: 'var(--text)' }}>Cartera por Etapa</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(STAGES).map(([key, meta]) => {
            const count = porStage[key] ?? 0
            const Icon = meta.icon
            return (
              <div key={key} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'rgba(26,32,53,0.03)', border: '1px solid rgba(26,32,53,0.07)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${meta.color}18` }}>
                  <Icon size={14} style={{ color: meta.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-black leading-none" style={{ color: 'var(--text)', fontFamily: '"Space Grotesk", sans-serif' }}>
                    {count}
                  </p>
                  <p className="text-[10px] font-medium mt-0.5 leading-tight" style={{ color: 'var(--text-muted)' }}>
                    {meta.label}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Alert: no activity */}
      {(porStage.incobrable ?? 0) > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
          <AlertCircle size={16} style={{ color: '#EF4444', flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#dc2626' }}>
              {porStage.incobrable} cliente{porStage.incobrable > 1 ? 's' : ''} marcado{porStage.incobrable > 1 ? 's' : ''} como incobrable{porStage.incobrable > 1 ? 's' : ''}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(220,38,38,0.75)' }}>
              Revisa la cartera para más detalles.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
