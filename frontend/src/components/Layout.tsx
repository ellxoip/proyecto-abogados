import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, UserCheck, GitBranch, Calendar,
  LogOut, Bell, Menu, CreditCard, Shield, ChevronRight, Wrench, Search, X, Smartphone, MessageSquare, Bot, Building2, QrCode, Building, GitBranch as GitBranchIcon, Wallet,
} from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { getNotificationCount, getAgentQueue, getLeadsCount } from '../api'
import { playMessageSound, playNewLeadSound, playNotificationSound } from '../hooks/useNotificationSound'
import { canDo } from '../utils/plans'
import InstallPWA from './InstallPWA'
import GlobalSearch from './GlobalSearch'
import NotificationPanel from './NotificationPanel'
import { NexioLogo } from './NexioLogo'

const NAV_SECTIONS = [
  {
    label: 'CRM',
    items: [
      { path: '/',           icon: LayoutDashboard, label: 'Dashboard',      sublabel: 'Vista general',  roles: ['superadmin','subadmin','agendadora','verificador','vendedor'] },
      { path: '/leads',      icon: UserCheck,       label: 'Leads',          sublabel: 'Gestión leads',  roles: ['superadmin','subadmin','agendadora'] },
      { path: '/pipeline',   icon: GitBranch,       label: 'Pipeline',       sublabel: 'Embudo ventas',  roles: ['superadmin','subadmin','agendadora'] },
      { path: '/contactos',  icon: Users,           label: 'Contactos',      sublabel: 'Base clientes',  roles: ['superadmin','subadmin','agendadora'] },
      { path: '/calendario',   icon: Calendar,        label: 'Calendario',     sublabel: 'Agenda grupal',  roles: ['superadmin','subadmin','agendadora'] },
      { path: '/agente-ia',     icon: Bot,             label: 'Agente IA',      sublabel: 'Leads IA pendientes', roles: ['agendadora','superadmin','subadmin'] },
      { path: '/whatsapp',      icon: MessageSquare,   label: 'WhatsApp',       sublabel: 'Chat clientes',    roles: ['agendadora'] },
      { path: '/mis-whatsapp',  icon: Smartphone,      label: 'Mis WhatsApp',   sublabel: 'Conectar números', roles: ['agendadora'] },
      { path: '/mi-pipeline',icon: GitBranch,       label: 'Mi Pipeline',    sublabel: 'Tus clientes',   roles: ['vendedor'] },
      { path: '/agenda',     icon: Calendar,        label: 'Agenda',         sublabel: 'Mis reuniones',  roles: ['vendedor'] },
    ],
  },
  {
    label: 'Cobranza',
    items: [
      { path: '/cobrador',          icon: LayoutDashboard, label: 'Dashboard',   sublabel: 'Resumen cobranza', roles: ['cobrador'] },
      { path: '/cobrador/cartera',  icon: Wallet,          label: 'Cartera',     sublabel: 'Mis clientes',     roles: ['cobrador'] },
      { path: '/cobrador/pipeline', icon: GitBranchIcon,   label: 'Pipeline',    sublabel: 'Embudo cobranza',  roles: ['cobrador'] },
      { path: '/mis-whatsapp',      icon: Smartphone,      label: 'Mis WhatsApp',sublabel: 'Conectar número',  roles: ['cobrador'] },
    ],
  },
  {
    label: 'Gestión',
    items: [
      { path: '/pagos',   icon: CreditCard,      label: 'Verificar Pagos',  sublabel: 'Confirmar cobros',  roles: ['verificador'] },
      { path: '/admin',   tab: 'users',          icon: Users,              label: 'Usuarios',             sublabel: 'Gestión accesos',   roles: ['superadmin','subadmin'] },
      { path: '/admin',   tab: 'groups',         icon: Building,           label: 'Grupos & Áreas',       sublabel: 'Organización',      roles: ['superadmin','subadmin'] },
      { path: '/admin',   tab: 'pipeline',       icon: GitBranchIcon,      label: 'Etapas',               sublabel: 'Configurar embudo', roles: ['superadmin','subadmin'] },
      { path: '/admin',   tab: 'whatsapp_sessions', icon: Smartphone,      label: 'WhatsApp',             sublabel: 'Sesiones QR',       roles: ['superadmin','subadmin'] },
      { path: '/admin',   tab: 'ai_agents',      icon: Bot,                label: 'Agentes IA',           sublabel: 'Mis agentes',       roles: ['superadmin','subadmin'] },
      { path: '/admin',   tab: 'security',       icon: Shield,             label: 'Seguridad',            sublabel: 'Auditoría ISO 27001', roles: ['superadmin'] },
      { path: '/tecnico', tab: 'negocios',    icon: Building2,          label: 'Negocios',             sublabel: 'Clientes CRM',      roles: ['tecnico'] },
      { path: '/tecnico', tab: 'overview',    icon: Wrench,             label: 'Resumen',              sublabel: 'Estado sistema',    roles: ['tecnico'] },
      { path: '/tecnico', tab: 'whatsapp',    icon: MessageSquare,      label: 'WhatsApp Meta',        sublabel: 'API oficial',       roles: ['tecnico'] },
      { path: '/tecnico', tab: 'whatsapp_qr', icon: QrCode,             label: 'WhatsApp QR',          sublabel: 'Escaneo QR',        roles: ['tecnico'] },
      { path: '/tecnico', tab: 'google',      icon: Calendar,           label: 'Google OAuth',         sublabel: 'Credenciales',      roles: ['tecnico'] },
      { path: '/tecnico', tab: 'users',       icon: Users,              label: 'Usuarios',             sublabel: 'Gestión accesos',   roles: ['tecnico'] },
      { path: '/tecnico', tab: 'ai_agents',   icon: Bot,                label: 'Agentes IA',           sublabel: 'Config agentes',    roles: ['tecnico'] },
      { path: '/tecnico', tab: 'security',    icon: Shield,             label: 'Seguridad',            sublabel: 'Auditoría global',   roles: ['tecnico'] },
    ],
  },
]


const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items)

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout }    = useAuthStore()
  const location            = useLocation()
  const navigate            = useNavigate()
  const [open, setOpen]           = useState(true)
  const [mobile, setMobile]       = useState(false)
  const [unread, setUnread]       = useState(0)
  const [agentCount, setAgentCount] = useState(0)
  const [leadsCount, setLeadsCount] = useState(0)
  const [showSearch, setShowSearch] = useState(false)
  const [showNotifPanel, setShowNotifPanel] = useState(false)

  // Sound state — skip first load to avoid playing on page open
  const prevUnread     = useRef<number | null>(null)
  const prevLeadCount  = useRef<number | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setOpen(false) }
    if (mq.matches) setOpen(false)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    const isAgendadora = user?.role === 'agendadora' || user?.role === 'superadmin' || user?.role === 'subadmin'
    const fetchCounts = () => {
      getNotificationCount().then((d: any) => {
        const next = d.unread as number
        if (prevUnread.current !== null && next > prevUnread.current) playNotificationSound()
        prevUnread.current = next
        setUnread(next)
      }).catch(() => {})
      if (isAgendadora) {
        getAgentQueue().then((d: any) => setAgentCount(d.count ?? 0)).catch(() => {})
        getLeadsCount({ stage: 'lead', exclude_ai: true }).then((d: any) => {
          const next = d.total as number
          if (prevLeadCount.current !== null && next > prevLeadCount.current) playNewLeadSound()
          prevLeadCount.current = next
          setLeadsCount(next)
        }).catch(() => {})
      }
    }
    fetchCounts()
    const id = setInterval(fetchCounts, 30000)
    window.addEventListener('lead-stage-changed', fetchCounts)
    window.addEventListener('notifications-updated', fetchCounts)
    return () => {
      clearInterval(id)
      window.removeEventListener('lead-stage-changed', fetchCounts)
      window.removeEventListener('notifications-updated', fetchCounts)
    }
  }, [user?.role])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setShowSearch(s => !s) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleLogout = () => { logout(); navigate('/login') }

  const allItems = NAV_SECTIONS.flatMap(s => s.items)
  const pathItems = allItems.filter((n: any) => location.pathname === n.path || (n.path !== '/' && location.pathname.startsWith(n.path)))
  const pageTitle = (
    pathItems.find((n: any) => n.tab && location.search.includes(`tab=${n.tab}`))?.label
    ?? pathItems.find((n: any) => !n.tab)?.label
    ?? pathItems.find((n: any) => n.tab)?.label
    ?? 'CRM'
  )

  const plan = user?.negocio_plan ?? 'basico'
  const isAiItem = (n: any) => n.path === '/agente-ia' || n.tab === 'ai_agents'
  const userNavItems = ALL_NAV_ITEMS.filter(n => {
    if (!user || !n.roles.includes(user.role)) return false
    // El técnico siempre ve Agentes IA (crea agentes para los negocios)
    if (isAiItem(n) && user.role !== 'tecnico' && !canDo(plan, 'max_ai_agents')) return false
    if (n.path === '/seguimiento' && !canDo(plan, 'seguimiento')) return false
    return true
  })
  const bottomNavItems = userNavItems.slice(0, 4)

  const SidebarContent = ({ expanded = open }: { expanded?: boolean }) => (
    <div className="flex flex-col h-full">

      {/* Brand */}
      <div className={`flex items-center gap-3 px-4 py-5 flex-shrink-0 ${!expanded && 'justify-center'}`}>
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #4361ee 0%, #25d366 100%)', boxShadow: '0 4px 16px rgba(67,97,238,0.50)' }}>
            <MessageSquare size={17} style={{ color: '#fff' }} />
          </div>
        </div>
        {expanded && (
          <div className="min-w-0">
            <p className="text-white font-black text-base leading-tight truncate"
               style={{ fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '-0.02em' }}>
              Nexio
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.38)' }}>WhatsApp CRM</p>
          </div>
        )}
      </div>

      {/* Divider with gradient */}
      <div className="mx-4 mb-3 h-px" style={{ background: 'linear-gradient(90deg, rgba(67,97,238,0.4) 0%, rgba(255,255,255,0.06) 100%)' }} />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 space-y-4 py-1">
        {NAV_SECTIONS.map(section => {
          const visible = section.items.filter(n => user && n.roles.includes(user.role))
          if (!visible.length) return null
          return (
            <div key={section.label}>
              {expanded && (
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] px-3 mb-1.5"
                   style={{ color: 'rgba(255,255,255,0.28)' }}>
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {visible.filter((n: any) => {
            // El técnico siempre ve Agentes IA
            if (isAiItem(n) && user?.role !== 'tecnico' && !canDo(plan, 'max_ai_agents')) return false
            if (n.path === '/seguimiento' && !canDo(plan, 'seguimiento')) return false
            return true
          }).map(({ path, icon: Icon, label, sublabel, tab: navTab }: any) => {
                  const DEFAULT_TABS: Record<string, string> = { '/tecnico': 'negocios', '/admin': 'users' }
                  const searchTab = new URLSearchParams(location.search).get('tab')
                  const active = navTab
                    ? location.pathname === path && (searchTab === navTab || (!location.search && DEFAULT_TABS[path] === navTab))
                    : location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
                  const badge = path === '/agente-ia' ? agentCount : path === '/leads' ? leadsCount : 0
                  const to = navTab ? `${path}?tab=${navTab}` : path
                  return (
                    <Link
                      key={navTab ? `${path}-${navTab}` : path}
                      to={to}
                      title={!expanded ? label : undefined}
                      onClick={() => setMobile(false)}
                      className="flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-medium transition-all duration-150 group"
                      style={active ? {
                        background: 'linear-gradient(90deg, rgba(67,97,238,0.22) 0%, rgba(67,97,238,0.08) 100%)',
                        color: '#ffffff',
                        borderLeft: '2.5px solid var(--primary)',
                        paddingLeft: '8px',
                      } : {
                        color: 'rgba(255,255,255,0.62)',
                      }}
                      onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = '#ffffff'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' } }}
                      onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.62)'; (e.currentTarget as HTMLElement).style.background = '' } }}
                    >
                      <div className="relative w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={active ? {
                          background: 'rgba(255,255,255,0.18)',
                          boxShadow: '0 0 10px rgba(255,255,255,0.08)',
                        } : {
                          background: 'rgba(255,255,255,0.08)',
                        }}>
                        <Icon size={14} style={{ color: active ? '#ffffff' : 'rgba(255,255,255,0.70)' }} />
                        {!expanded && badge > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[8px] font-black px-0.5"
                            style={{ background: path === '/agente-ia' ? '#4361ee' : '#ef233c', color: '#fff', lineHeight: 1 }}>
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </div>
                      {expanded && (
                        <div className="min-w-0 flex-1">
                          <p className="leading-tight truncate text-[13px] font-semibold" style={{ color: active ? '#ffffff' : 'inherit' }}>{label}</p>
                          {sublabel && (
                            <p className="text-[9px] leading-tight truncate mt-0.5"
                               style={{ color: active ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.35)' }}>
                              {sublabel}
                            </p>
                          )}
                        </div>
                      )}
                      {expanded && badge > 0 && (
                        <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-black px-1"
                          style={{ background: path === '/agente-ia' ? 'rgba(67,97,238,0.25)' : 'rgba(239,35,60,0.25)', color: path === '/agente-ia' ? '#7b9ff5' : '#ff6b6b' }}>
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                      {expanded && active && badge === 0 && <ChevronRight size={11} className="flex-shrink-0" style={{ color: 'rgba(255,255,255,0.50)' }} />}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Install PWA */}
      {expanded && (
        <div className="px-2.5 pb-3 flex-shrink-0">
          <InstallPWA variant="button" />
        </div>
      )}

      {/* User footer */}
      <div className="flex-shrink-0 mx-2.5 mb-3">
        <div className="h-px mb-3" style={{ background: 'rgba(255,255,255,0.07)' }} />
        {expanded ? (
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs"
              style={{ background: 'linear-gradient(135deg, #4361ee 0%, #3a0ca3 100%)', color: '#fff', fontFamily: '"Space Grotesk", sans-serif' }}>
              {user?.name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate leading-tight" style={{ color: '#ffffff' }}>{user?.name}</p>
            </div>
            <button onClick={handleLogout} title="Cerrar sesión"
              className="p-1.5 rounded-lg transition-all flex-shrink-0"
              style={{ color: 'rgba(255,255,255,0.35)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ff6b6b'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,35,60,0.15)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; (e.currentTarget as HTMLElement).style.background = '' }}>
              <LogOut size={13} />
            </button>
          </div>
        ) : (
          <div className="flex justify-center">
            <button onClick={handleLogout} title="Cerrar sesión"
              className="p-2 rounded-xl transition-all"
              style={{ color: 'rgba(255,255,255,0.35)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ff6b6b'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,35,60,0.15)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; (e.currentTarget as HTMLElement).style.background = '' }}>
              <LogOut size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col flex-shrink-0 transition-all duration-300 relative overflow-hidden ${open ? 'w-64' : 'w-[64px]'}`}
        style={{
          background: 'linear-gradient(180deg, #080d1c 0%, #060a16 55%, #05080f 100%)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Ambient top glow — blue */}
        <div className="absolute pointer-events-none" style={{
          top: '-60px', left: '-60px', width: '260px', height: '260px',
          background: 'radial-gradient(circle, rgba(67,97,238,0.20) 0%, transparent 65%)',
        }} />
        {/* Ambient bottom accent — purple */}
        <div className="absolute pointer-events-none" style={{
          bottom: '60px', right: '-50px', width: '180px', height: '180px',
          background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 65%)',
        }} />
        {/* Dot grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
        <div className="relative z-10 flex flex-col h-full">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobile && (
        <>
          <div className="fixed inset-0 z-40 md:hidden" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
            onClick={() => setMobile(false)} />
          <aside className="fixed left-0 top-0 h-full w-64 flex flex-col z-50 md:hidden relative overflow-hidden"
            style={{ background: 'linear-gradient(180deg, #080d1c 0%, #060a16 55%, #05080f 100%)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Ambient glow — blue top */}
            <div className="absolute pointer-events-none" style={{
              top: '-60px', left: '-60px', width: '260px', height: '260px',
              background: 'radial-gradient(circle, rgba(67,97,238,0.20) 0%, transparent 65%)',
            }} />
            {/* Ambient bottom accent — purple */}
            <div className="absolute pointer-events-none" style={{
              bottom: '60px', right: '-50px', width: '180px', height: '180px',
              background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 65%)',
            }} />
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }} />
            <div className="absolute top-4 right-4 z-20">
              <button onClick={() => setMobile(false)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'rgba(255,255,255,0.45)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#fff'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)'}>
                <X size={16} />
              </button>
            </div>
            <div className="relative z-10 flex flex-col h-full">
              <SidebarContent expanded={true} />
            </div>
          </aside>
        </>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="flex items-center px-4 gap-3 flex-shrink-0"
          style={{
            background: '#ffffff',
            borderBottom: '1px solid rgba(26,32,53,0.10)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            paddingTop: 'max(12px, env(safe-area-inset-top))',
            paddingBottom: '12px',
            minHeight: '56px',
          }}>
          {/* Mobile menu — área táctil grande para iOS */}
          <button onClick={() => setMobile(true)}
            className="md:hidden flex items-center justify-center rounded-xl transition-colors"
            style={{ color: 'rgba(26,32,53,0.60)', minWidth: '44px', minHeight: '44px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(26,32,53,0.06)'; (e.currentTarget as HTMLElement).style.color = '#1a2035' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'rgba(26,32,53,0.60)' }}>
            <Menu size={22} />
          </button>
          {/* Desktop collapse toggle */}
          <button onClick={() => setOpen(!open)}
            className="hidden md:flex p-2 rounded-xl transition-colors"
            style={{ color: 'rgba(26,32,53,0.40)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(26,32,53,0.06)'; (e.currentTarget as HTMLElement).style.color = '#1a2035' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'rgba(26,32,53,0.40)' }}>
            <Menu size={17} />
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>CRM</span>
            <ChevronRight size={12} style={{ color: 'rgba(26,32,53,0.20)' }} />
            <span className="font-semibold" style={{ color: '#1a2035', fontFamily: '"Space Grotesk", sans-serif' }}>
              {pageTitle}
            </span>
          </div>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2">
            {/* Search */}
            <button onClick={() => setShowSearch(true)}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs transition-colors"
              style={{
                border: '1px solid rgba(26,32,53,0.14)',
                background: 'rgba(26,32,53,0.04)',
                color: 'rgba(26,32,53,0.40)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(26,32,53,0.08)'; (e.currentTarget as HTMLElement).style.color = 'rgba(26,32,53,0.75)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(26,32,53,0.04)'; (e.currentTarget as HTMLElement).style.color = 'rgba(26,32,53,0.40)' }}>
              <Search size={12} />
              <span>Buscar</span>
              <kbd className="text-[9px] px-1.5 py-0.5 rounded"
                   style={{ background: 'rgba(26,32,53,0.06)', border: '1px solid rgba(26,32,53,0.14)' }}>⌘K</kbd>
            </button>
            <button onClick={() => setShowSearch(true)}
              className="sm:hidden p-2 rounded-xl transition-colors"
              style={{ color: 'rgba(26,32,53,0.40)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(26,32,53,0.06)'; (e.currentTarget as HTMLElement).style.color = '#1a2035' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'rgba(26,32,53,0.40)' }}>
              <Search size={17} />
            </button>

            {/* Notifications */}
            <button onClick={() => setShowNotifPanel(v => !v)} className="relative flex-shrink-0"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '38px', height: '38px', borderRadius: '12px',
                background: showNotifPanel ? 'rgba(239,35,60,0.14)' : unread > 0 ? 'rgba(239,35,60,0.10)' : 'rgba(26,32,53,0.05)',
                border: unread > 0 ? '1.5px solid rgba(239,35,60,0.25)' : '1.5px solid rgba(26,32,53,0.10)',
                color: unread > 0 ? '#ef233c' : 'rgba(26,32,53,0.45)',
                transition: 'all 0.18s',
                boxShadow: unread > 0 ? '0 0 12px rgba(239,35,60,0.15)' : 'none',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = unread > 0 ? 'rgba(239,35,60,0.16)' : 'rgba(26,32,53,0.09)'; (e.currentTarget as HTMLElement).style.color = unread > 0 ? '#ef233c' : '#1a2035' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = showNotifPanel ? 'rgba(239,35,60,0.14)' : unread > 0 ? 'rgba(239,35,60,0.10)' : 'rgba(26,32,53,0.05)'; (e.currentTarget as HTMLElement).style.color = unread > 0 ? '#ef233c' : 'rgba(26,32,53,0.45)' }}>
              <Bell size={20} strokeWidth={unread > 0 ? 2.2 : 1.8} className={unread > 0 ? 'bell-ring' : ''} />
              {unread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] rounded-full flex items-center justify-center text-[10px] font-black px-1"
                  style={{ background: '#ef233c', color: '#fff', boxShadow: '0 2px 8px rgba(239,35,60,0.5)', lineHeight: 1 }}>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>

            <div className="w-px h-5 mx-0.5" style={{ background: 'rgba(26,32,53,0.12)' }} />

            {/* User */}
            <div className="flex items-center gap-2.5 pl-1">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #4361ee, #25d366)' }}>
                <span style={{ color: '#fff', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '0.75rem' }}>
                  {user?.name?.charAt(0)}
                </span>
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold leading-tight"
                   style={{ color: '#1a2035', fontFamily: '"Space Grotesk", sans-serif' }}>
                  {user?.name}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="light-zone flex-1 overflow-auto p-4 sm:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-stretch"
        style={{
          background: '#ffffff',
          borderTop: '1px solid rgba(26,32,53,0.10)',
          boxShadow: '0 -2px 12px rgba(26,32,53,0.07)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
        {bottomNavItems.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
          return (
            <Link key={path} to={path}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold transition-colors"
              style={{ color: active ? '#4361ee' : 'rgba(26,32,53,0.38)' }}>
              <div className="p-1.5 rounded-lg transition-colors"
                style={{ background: active ? 'rgba(67,97,238,0.10)' : 'transparent' }}>
                <Icon size={18} />
              </div>
              <span className="leading-none">{label}</span>
            </Link>
          )
        })}
        <button onClick={handleLogout}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold transition-colors"
          style={{ color: 'rgba(26,32,53,0.38)' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--danger)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(26,32,53,0.38)'}>
          <div className="p-1.5 rounded-lg">
            <LogOut size={18} />
          </div>
          <span className="leading-none">Salir</span>
        </button>
      </nav>

      {showSearch && <GlobalSearch onClose={() => setShowSearch(false)} />}
      {showNotifPanel && (
        <NotificationPanel
          onClose={() => setShowNotifPanel(false)}
          onCountChange={count => setUnread(count)}
        />
      )}
    </div>
  )
}
