import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { friendlyError } from '../lib/supabase'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}

interface ToastApi {
  success: (text: string) => void
  error: (err: unknown) => void
  info: (text: string) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const remove = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (kind: ToastKind, text: string) => {
      const id = ++seq.current
      setItems((l) => [...l.slice(-3), { id, kind, text }])
      window.setTimeout(() => remove(id), kind === 'error' ? 7000 : 3500)
    },
    [remove],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (t) => push('success', t),
      info: (t) => push('info', t),
      error: (e) => push('error', typeof e === 'string' ? e : friendlyError(e)),
    }),
    [push],
  )

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-3.5 shadow-lg ${
              t.kind === 'error' ? 'border-red-200' : t.kind === 'success' ? 'border-emerald-200' : 'border-navy-200'
            }`}
          >
            {t.kind === 'success' && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />}
            {t.kind === 'error' && <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}
            {t.kind === 'info' && <Info className="mt-0.5 h-5 w-5 shrink-0 text-navy-600" />}
            <p className="flex-1 text-sm text-slate-700">{t.text}</p>
            <button className="btn-icon -m-1" onClick={() => remove(t.id)} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider')
  return ctx
}
