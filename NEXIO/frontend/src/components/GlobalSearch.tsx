import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, User, Phone } from 'lucide-react'
import { searchLeads } from '../api'
import { STAGE_LABELS, STAGE_COLORS } from '../types'

interface Props {
  onClose: () => void
}

export default function GlobalSearch({ onClose }: Props) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const data = await searchLeads(q.trim())
      setResults(data ?? [])
      setSelected(0)
    } catch { setResults([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(query), 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query, doSearch])

  const goTo = (lead: any) => {
    navigate(`/leads/${lead.id}`)
    onClose()
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && results[selected]) goTo(results[selected])
  }

  // Group by contact
  const byContact = results.reduce((acc: Record<number, any[]>, lead: any) => {
    const cid = lead.contact?.id ?? lead.id
    if (!acc[cid]) acc[cid] = []
    acc[cid].push(lead)
    return acc
  }, {})

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center pt-16 px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>

      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ maxHeight: '70vh' }}>

        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Buscar cliente por nombre, teléfono o RUT..."
            className="flex-1 text-sm text-gray-800 placeholder:text-gray-400 outline-none bg-transparent"
          />
          {loading && <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin flex-shrink-0" />}
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-surface-2 transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 60px)' }}>
          {query.trim() && !loading && results.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">No se encontraron resultados para "{query}"</p>
          )}
          {!query.trim() && (
            <p className="text-xs text-gray-400 text-center py-8">Escriba el nombre, teléfono o RUT del cliente</p>
          )}

          {Object.values(byContact).map((leads: any[]) => {
            const contact = leads[0].contact
            return (
              <div key={contact?.id ?? leads[0].id} className="border-b border-gray-50 last:border-0">
                {/* Contact header */}
                <div className="flex items-center gap-2.5 px-4 pt-3 pb-2">
                  <div className="w-8 h-8 rounded-full bg-lime-dim flex items-center justify-center text-lime font-bold text-xs flex-shrink-0">
                    {contact?.name?.charAt(0)?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{contact?.name ?? '—'}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Phone size={10} /> {contact?.phone ?? '—'}
                      {contact?.rut_persona && <span className="ml-2"><User size={10} className="inline" /> {contact.rut_persona}</span>}
                    </p>
                  </div>
                </div>

                {/* Expedientes */}
                <div className="px-4 pb-3 space-y-1 pl-14">
                  {leads.map((lead: any, i: number) => {
                    const flatIdx = results.indexOf(lead)
                    const isActive = flatIdx === selected
                    return (
                      <button key={lead.id} onClick={() => goTo(lead)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-colors ${
                          isActive ? 'bg-lime-dim text-gray-900' : 'hover:bg-surface-3 text-gray-700'
                        }`}>
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STAGE_COLORS[lead.current_stage]?.split(' ')[0] ?? 'bg-gray-300'}`} />
                        <span className="text-xs font-semibold flex-1 truncate">{lead.area?.name ?? 'Sin área'}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0 ${
                          STAGE_COLORS[lead.current_stage] ?? 'bg-surface-3 text-gray-600'
                        }`}>
                          {STAGE_LABELS[lead.current_stage] ?? lead.current_stage}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400 flex items-center justify-between">
            <span>↑↓ navegar · Enter abrir · Esc cerrar</span>
            <span>{results.length} resultado{results.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </div>
  )
}
