import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Inbox, Loader2, Search, X } from 'lucide-react'
import type { Tone } from '../lib/constants'
import { initials } from '../lib/format'

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <Loader2 className={`animate-spin text-navy-600 ${className}`} />
}

export function LoadingBlock({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
      <Spinner /> {text}
    </div>
  )
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-red-500" />
      <p className="max-w-md text-sm text-slate-600">{message}</p>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="rounded-full bg-navy-50 p-3">
        <Inbox className="h-6 w-6 text-navy-500" />
      </div>
      <p className="font-semibold text-navy-900">{title}</p>
      {text && <p className="max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

const toneClasses: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  navy: 'bg-navy-50 text-navy-800 ring-navy-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
}

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${toneClasses[tone]}`}>
      {children}
    </span>
  )
}

export function Field({
  label,
  children,
  hint,
  className = '',
  required,
}: {
  label: string
  children: ReactNode
  hint?: string
  className?: string
  required?: boolean
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'navy',
  hint,
  onClick,
}: {
  label: string
  value: ReactNode
  icon?: ReactNode
  tone?: 'navy' | 'green' | 'amber' | 'red' | 'blue'
  hint?: string
  onClick?: () => void
}) {
  const iconBg = {
    navy: 'bg-navy-50 text-navy-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-sky-50 text-sky-700',
  }[tone]
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`card flex items-start gap-3 p-4 text-left ${onClick ? 'transition hover:border-navy-300 hover:shadow-md' : ''}`}
    >
      {icon && <div className={`rounded-lg p-2 ${iconBg}`}>{icon}</div>}
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 truncate font-display text-xl font-bold text-navy-900">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
    </Comp>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])
  if (!open) return null
  const width = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }[size]
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className={`flex max-h-[95vh] w-full ${width} flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:rounded-b-2xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string; icon?: ReactNode; hidden?: boolean }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="scrollbar-thin -mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
      {tabs
        .filter((t) => !t.hidden)
        .map((t) => (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
              value === t.value ? 'border-navy-900 text-navy-900' : 'border-transparent text-slate-500 hover:text-navy-800'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input className="input pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

export function Avatar({ name, src, size = 'md' }: { name: string; src?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-16 w-16 text-lg' }[size]
  if (src) return <img src={src} alt={name} className={`${s} shrink-0 rounded-full object-cover ring-2 ring-white`} />
  return (
    <div className={`${s} flex shrink-0 items-center justify-center rounded-full bg-navy-100 font-bold text-navy-800`}>{initials(name) || '?'}</div>
  )
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:gap-3">
      <dt className="w-40 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 flex-1 whitespace-pre-line break-words text-sm text-slate-700">{children || '—'}</dd>
    </div>
  )
}

export function Card({ title, actions, children, className = '', bodyClass = 'p-5' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          {title && <h3 className="section-title">{title}</h3>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 text-navy-900 focus:ring-navy-400"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}
