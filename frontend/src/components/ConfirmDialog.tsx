import { useState, useCallback } from 'react'
import { AlertTriangle, Trash2, X } from 'lucide-react'

interface ConfirmDialogProps {
  title?: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', danger = true, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="bg-surface-1 rounded-2xl shadow-modal w-full max-w-sm flex flex-col" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          {danger && (
            <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,35,60,0.12)', border: '1px solid rgba(239,35,60,0.25)' }}>
              <AlertTriangle size={16} style={{ color: '#ef233c' }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {title && <p className="text-sm font-bold text-white mb-1">{title}</p>}
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>{message}</p>
          </div>
          <button onClick={onCancel} className="flex-shrink-0 p-1 rounded-lg hover:bg-surface-2 transition-colors" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <X size={15} />
          </button>
        </div>
        <div className="flex gap-2.5 px-5 pb-5 justify-end">
          <button onClick={onCancel} className="btn-secondary text-sm px-4 py-2">Cancelar</button>
          <button
            onClick={onConfirm}
            className="text-sm px-4 py-2 rounded-xl font-semibold transition-colors"
            style={danger
              ? { background: 'rgba(239,35,60,0.15)', border: '1px solid rgba(239,35,60,0.35)', color: '#ef233c' }
              : { background: 'rgba(67,97,238,0.15)', border: '1px solid rgba(67,97,238,0.35)', color: '#4361ee' }
            }
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = danger ? 'rgba(239,35,60,0.25)' : 'rgba(67,97,238,0.25)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = danger ? 'rgba(239,35,60,0.15)' : 'rgba(67,97,238,0.15)' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

interface ConfirmState {
  title?: string
  message: string
  confirmLabel?: string
  danger?: boolean
  resolve: (v: boolean) => void
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null)

  const confirm = useCallback((message: string, opts?: { title?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> => {
    return new Promise(resolve => setState({ message, ...opts, resolve }))
  }, [])

  const dialog = state ? (
    <ConfirmDialog
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      danger={state.danger ?? true}
      onConfirm={() => { state.resolve(true); setState(null) }}
      onCancel={() => { state.resolve(false); setState(null) }}
    />
  ) : null

  return { confirm, dialog }
}
