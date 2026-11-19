import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '../components/ui'

interface ConfirmOptions {
  title: string
  text?: string
  confirmText?: string
  danger?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmCtx = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (v: boolean) => {
    resolver.current?.(v)
    resolver.current = null
    setOpts(null)
  }

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!opts}
        onClose={() => close(false)}
        title={opts?.title ?? ''}
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => close(false)}>
              Cancelar
            </button>
            <button className={opts?.danger === false ? 'btn-primary' : 'btn-danger'} onClick={() => close(true)} autoFocus>
              {opts?.confirmText ?? 'Eliminar'}
            </button>
          </>
        }
      >
        <div className="flex gap-3">
          <AlertTriangle className={`h-6 w-6 shrink-0 ${opts?.danger === false ? 'text-navy-600' : 'text-red-500'}`} />
          <p className="text-sm text-slate-600">{opts?.text ?? 'Esta acción no se puede deshacer.'}</p>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('useConfirm debe usarse dentro de ConfirmProvider')
  return ctx
}
