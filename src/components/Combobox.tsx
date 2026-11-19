import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'

export interface ComboItem {
  id: string
  label: string
  sub?: string
}

/** Selector con búsqueda (para clientes, eventos, personal…). */
export default function Combobox({
  items,
  value,
  onChange,
  placeholder = 'Buscar…',
  disabled,
  emptyText = 'Sin resultados',
}: {
  items: ComboItem[]
  value: string | null
  onChange: (id: string | null) => void
  placeholder?: string
  disabled?: boolean
  emptyText?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const selected = items.find((i) => i.id === value) ?? null

  const filtered = useMemo(() => {
    const q = query
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
    if (!q) return items.slice(0, 60)
    return items
      .filter((i) =>
        `${i.label} ${i.sub ?? ''}`
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .includes(q),
      )
      .slice(0, 60)
  }, [items, query])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => setActive(0), [query, open])

  const pick = (id: string) => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <input
          className="input pr-16"
          disabled={disabled}
          value={open ? query : selected ? selected.label : ''}
          placeholder={selected && !open ? selected.label : placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, filtered.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              if (open && filtered[active]) {
                e.preventDefault()
                pick(filtered[active].id)
              }
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1">
          {selected && !disabled && (
            <button type="button" className="rounded p-0.5 text-slate-400 hover:text-red-500" onClick={() => onChange(null)} aria-label="Quitar">
              <X className="h-4 w-4" />
            </button>
          )}
          <ChevronsUpDown className="h-4 w-4 text-slate-400" />
        </div>
      </div>
      {open && !disabled && (
        <ul className="scrollbar-thin absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {filtered.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">{emptyText}</li>}
          {filtered.map((i, idx) => (
            <li key={i.id}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${idx === active ? 'bg-navy-50' : ''}`}
                onMouseEnter={() => setActive(idx)}
                onClick={() => pick(i.id)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{i.label}</span>
                  {i.sub && <span className="block truncate text-xs text-slate-400">{i.sub}</span>}
                </span>
                {i.id === value && <Check className="h-4 w-4 shrink-0 text-navy-700" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
