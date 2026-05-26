import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import toast from 'react-hot-toast'
import { MessageSquare, Lock, Mail, Eye, EyeOff, Zap, BarChart2, Users, Bell } from 'lucide-react'
import { NexioLogo } from '../components/NexioLogo'
import InstallPWA from '../components/InstallPWA'

const FEATURES = [
  { icon: MessageSquare, label: 'WhatsApp Multi-agente',  sub: 'Múltiples números y equipos conectados',   color: '#25d366' },
  { icon: BarChart2,     label: 'Pipeline Inteligente',   sub: 'Embudo visual en tiempo real',             color: '#4361ee' },
  { icon: Users,         label: 'CRM Completo',           sub: 'Leads, contactos y seguimiento unificado', color: '#7c3aed' },
  { icon: Bell,          label: 'Alertas Instantáneas',   sub: 'Notificaciones y recordatorios al instante',color: '#f59e0b' },
]


export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const login    = useAuthStore(s => s.login)
  const getUser  = useAuthStore(s => s.user)
  const navigate = useNavigate()

  function homeFor(role?: string) {
    if (role === 'tecnico')    return '/tecnico'
    if (role === 'vendedor')   return '/agenda'
    if (role === 'verificador') return '/pagos'
    if (role === 'agendadora') return '/'
    return '/'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
      const role = useAuthStore.getState().user?.role
      toast.success('¡Bienvenido a Nexio!')
      navigate(homeFor(role))
    } catch (err: any) {
      if (!err?.response) {
        toast.error('Backend no disponible. Verifica la URL de la API')
      } else {
        toast.error(err?.response?.data?.detail || 'Credenciales incorrectas')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex overflow-hidden relative select-none"
      style={{ background: 'linear-gradient(135deg, #05080f 0%, #080d1c 45%, #060a16 100%)' }}>

      {/* ── Ambient background orbs ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Blue orb top-left */}
        <div className="login-orb" style={{
          top: '-15%', left: '-8%', width: 700, height: 700,
          background: 'radial-gradient(circle, rgba(67,97,238,0.20) 0%, transparent 65%)',
        }} />
        {/* Green orb bottom-center */}
        <div className="login-orb" style={{
          bottom: '-12%', left: '25%', width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(37,211,102,0.13) 0%, transparent 65%)',
          animationDelay: '2s',
        }} />
        {/* Purple orb right */}
        <div className="login-orb" style={{
          top: '30%', right: '-5%', width: 500, height: 500,
          background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 65%)',
          animationDelay: '4s',
        }} />
        {/* Small accent top-right */}
        <div className="login-orb" style={{
          top: '5%', right: '15%', width: 300, height: 300,
          background: 'radial-gradient(circle, rgba(67,97,238,0.10) 0%, transparent 65%)',
          animationDelay: '1s',
        }} />

        {/* Subtle dot grid */}
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
      </div>

      {/* ── Inner centered container ── */}
      <div className="flex w-full max-w-[1440px] mx-auto min-h-screen relative z-10">

      {/* ══ LEFT HERO PANEL ══ */}
      <div className="hidden lg:flex flex-col justify-center lg:w-1/2 px-12 xl:px-16">

        {/* Brand mark */}
        <div className="flex items-center gap-4 mb-14">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #4361ee 0%, #25d366 100%)',
                boxShadow: '0 0 40px rgba(67,97,238,0.55), 0 0 80px rgba(37,211,102,0.18)',
              }}>
              <MessageSquare size={26} color="#fff" strokeWidth={2} />
            </div>
            <div className="absolute -inset-2 rounded-3xl -z-10"
              style={{ background: 'linear-gradient(135deg, #4361ee, #25d366)', filter: 'blur(14px)', opacity: 0.35 }} />
          </div>
          <div>
            <p className="text-3xl font-black tracking-tight leading-none" style={{ color: '#ffffff', fontFamily: '"Space Grotesk", sans-serif' }}>
              Nexio
            </p>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
              WhatsApp CRM
            </p>
          </div>
        </div>

        {/* Headline */}
        <div className="mb-12">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="h-px w-8 rounded-full" style={{ background: '#25d366' }} />
            <span className="text-xs font-bold uppercase tracking-[0.22em]" style={{ color: '#25d366' }}>
              Plataforma de mensajería
            </span>
          </div>

          <h1 className="font-black leading-[1.0] mb-5"
            style={{ fontSize: 'clamp(42px, 4.2vw, 66px)', fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '-0.03em' }}>
            <span style={{ color: '#ffffff' }}>Conecta tu</span><br />
            <span style={{
              background: 'linear-gradient(90deg, #4f72ff 0%, #25d366 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>negocio</span><br />
            <span style={{ color: 'rgba(255,255,255,0.85)' }}>con cada cliente</span>
          </h1>

          <p className="text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.42)', maxWidth: 400 }}>
            Gestiona todas tus conversaciones de WhatsApp, convierte leads y cierra ventas — desde un solo panel centralizado.
          </p>
        </div>

        {/* 3D feature cards */}
        <div className="grid grid-cols-2 gap-3" style={{ maxWidth: 440, perspective: '1000px' }}>
          {FEATURES.map(({ icon: Icon, label, sub, color }) => (
            <div key={label}
              className="rounded-2xl p-4 cursor-default transition-all duration-300 login-feature-card"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                backdropFilter: 'blur(12px)',
                transform: 'rotateX(6deg) translateZ(0)',
                transformStyle: 'preserve-3d',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement
                el.style.transform = 'rotateX(0deg) translateY(-5px) translateZ(10px)'
                el.style.borderColor = `${color}55`
                el.style.background = `rgba(255,255,255,0.07)`
                el.style.boxShadow = `0 12px 32px rgba(0,0,0,0.35), 0 0 0 1px ${color}33`
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement
                el.style.transform = 'rotateX(6deg) translateZ(0)'
                el.style.borderColor = 'rgba(255,255,255,0.07)'
                el.style.background = 'rgba(255,255,255,0.04)'
                el.style.boxShadow = 'none'
              }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                style={{ background: `${color}1a`, border: `1px solid ${color}44` }}>
                <Icon size={16} style={{ color }} strokeWidth={2} />
              </div>
              <p className="text-[12px] font-bold leading-tight mb-1.5" style={{ color: '#ffffff' }}>{label}</p>
              <p className="text-[10px] leading-snug" style={{ color: 'rgba(255,255,255,0.38)' }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* Trust badges */}
        <div className="flex items-center gap-6 mt-12">
          {[
            { val: '10K+', lbl: 'Conversaciones/día' },
            { val: '99.9%', lbl: 'Disponibilidad' },
            { val: '< 1s', lbl: 'Latencia' },
          ].map(({ val, lbl }) => (
            <div key={lbl}>
              <p className="text-lg font-black" style={{ color: '#ffffff', fontFamily: '"Space Grotesk", sans-serif' }}>{val}</p>
              <p className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>{lbl}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ══ RIGHT LOGIN FORM ══ */}
      <div className="flex flex-col justify-center w-full lg:w-1/2 relative z-10 px-6 py-10 lg:px-10 xl:px-14">

        {/* Mobile brand */}
        <div className="flex items-center justify-center gap-3 mb-8 lg:hidden">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #4361ee, #25d366)', boxShadow: '0 0 24px rgba(67,97,238,0.55)' }}>
            <MessageSquare size={20} color="#fff" />
          </div>
          <span className="text-2xl font-black text-white" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>Nexio</span>
        </div>

        {/* Glass login card */}
        <div className="rounded-3xl p-8 xl:p-10"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: '0 30px 70px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)',
          }}>

          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#25d366' }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#25d366' }}>
                Acceso seguro
              </span>
            </div>
            <h2 className="text-2xl font-black leading-tight"
              style={{ color: '#ffffff', fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '-0.02em' }}>
              Bienvenido de vuelta
            </h2>
            <p className="text-sm mt-1.5" style={{ color: 'rgba(255,255,255,0.42)' }}>
              Inicia sesión para gestionar tus conversaciones
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-2"
                style={{ color: 'rgba(255,255,255,0.40)' }}>
                Correo electrónico
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'rgba(255,255,255,0.28)' }} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full pl-11 pr-4 py-3.5 text-sm rounded-xl transition-all focus:outline-none placeholder:text-white/20"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', color: '#ffffff' }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(67,97,238,0.60)'; e.currentTarget.style.background = 'rgba(67,97,238,0.08)' }}
                  onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                  placeholder="tu@empresa.com"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-2"
                style={{ color: 'rgba(255,255,255,0.40)' }}>
                Contraseña
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'rgba(255,255,255,0.28)' }} />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full pl-11 pr-12 py-3.5 text-sm rounded-xl transition-all focus:outline-none placeholder:text-white/20"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', color: '#ffffff' }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(67,97,238,0.60)'; e.currentTarget.style.background = 'rgba(67,97,238,0.08)' }}
                  onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'rgba(255,255,255,0.30)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.70)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.30)'}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-xl text-sm font-bold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #4361ee 0%, #3652d9 100%)', color: '#ffffff', boxShadow: '0 8px 28px rgba(67,97,238,0.50)' }}
              onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 36px rgba(67,97,238,0.65)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' } }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(67,97,238,0.50)'; (e.currentTarget as HTMLElement).style.transform = '' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2.5">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verificando...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Ingresar al sistema <Zap size={14} strokeWidth={2.5} />
                </span>
              )}
            </button>
          </form>

          {/* PWA install */}
          <div className="mt-4">
            <InstallPWA variant="banner" />
          </div>

          {/* Quick access test users */}
          <div className="mt-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: 'rgba(255,255,255,0.28)' }}>
              Usuarios de prueba
            </p>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              <table className="w-full text-[11px]">
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <th className="text-left px-3 py-2 font-bold" style={{ color: 'rgba(255,255,255,0.35)' }}>Rol</th>
                    <th className="text-left px-3 py-2 font-bold" style={{ color: 'rgba(255,255,255,0.35)' }}>Email</th>
                    <th className="text-left px-3 py-2 font-bold" style={{ color: 'rgba(255,255,255,0.35)' }}>Clave</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { rol: 'SuperAdmin',  email: 'jorge@abogadostributarios.cl',    pw: 'Admin2024!',   color: '#4361ee' },
                    { rol: 'SubAdmin',    email: 'nicolas@abogadostributarios.cl',  pw: 'Sub2024!',     color: '#7c3aed' },
                    { rol: 'Vendedor',    email: 'jonathan@abogadostributarios.cl', pw: 'Pass2024!',    color: '#25d366' },
                    { rol: 'Agendadora',  email: 'marcela@abogadostributarios.cl',  pw: 'Pass2024!',    color: '#f59e0b' },
                    { rol: 'Verificador', email: 'dante@abogadostributarios.cl',    pw: 'Pass2024!',    color: '#ef4444' },
                    { rol: 'Técnico',     email: 'tecnico@abogadostributarios.cl',  pw: 'Tecnico2024!', color: '#64748b' },
                  ].map(({ rol, email, pw, color }) => (
                    <tr key={rol}
                      className="cursor-pointer transition-all"
                      style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                      onClick={() => { setEmail(email); setPassword(pw) }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                      <td className="px-3 py-2">
                        <span className="font-bold" style={{ color }}>{rol}</span>
                      </td>
                      <td className="px-3 py-2 font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>{email}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: 'rgba(255,255,255,0.40)' }}>{pw}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[9px] mt-1.5 text-center" style={{ color: 'rgba(255,255,255,0.18)' }}>
              Haz clic en una fila para autocompletar
            </p>
          </div>

          <p className="text-center text-[9px] mt-4" style={{ color: 'rgba(255,255,255,0.18)' }}>
            © 2026 Nexio · WhatsApp CRM Platform · v1.0
          </p>
        </div>
      </div>

      </div>{/* end inner centered container */}
    </div>
  )
}
