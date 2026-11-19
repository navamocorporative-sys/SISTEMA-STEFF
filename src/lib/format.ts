import { differenceInCalendarDays, differenceInMonths, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 })
const moneyShort = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

export function fmtMoney(n: number | string | null | undefined, short = false): string {
  const v = Number(n ?? 0)
  return (short ? moneyShort : money).format(Number.isFinite(v) ? v : 0)
}

export function num(n: number | string | null | undefined): number {
  const v = Number(n ?? 0)
  return Number.isFinite(v) ? v : 0
}

/** Convierte "2026-10-03" a fecha local sin desfase de zona horaria. */
export function toDate(d: string): Date {
  return parseISO(d.length === 10 ? `${d}T12:00:00` : d)
}

export function fmtDate(d: string | null | undefined, pattern = "d 'de' MMM yyyy"): string {
  if (!d) return '—'
  try {
    return format(toDate(d), pattern, { locale: es })
  } catch {
    return '—'
  }
}

/** "Sábado 03 de octubre del 2026" (formato de los documentos) */
export function fmtLongDate(d: string | null | undefined): string {
  if (!d) return ''
  const s = format(toDate(d), "EEEE dd 'de' MMMM 'del' yyyy", { locale: es })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  return format(parseISO(d), "d MMM yyyy, h:mm a", { locale: es })
}

/** "19:00:00" -> "7:00 PM" */
export function fmtTime(t: string | null | undefined): string {
  if (!t) return ''
  const [hS, mS] = t.split(':')
  const h = Number(hS)
  const m = Number(mS ?? 0)
  if (!Number.isFinite(h)) return ''
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

export function fmtTimeRange(a: string | null | undefined, b: string | null | undefined): string {
  const x = fmtTime(a)
  const y = fmtTime(b)
  if (x && y) return `${x} – ${y}`
  return x || y || ''
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function isoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function daysUntil(d: string): number {
  return differenceInCalendarDays(toDate(d), new Date())
}

/** Antigüedad legible: "1 año 3 meses", "5 meses", "12 días" */
export function seniority(since: string | null | undefined): string {
  if (!since) return '—'
  const start = toDate(since)
  const months = differenceInMonths(new Date(), start)
  if (months <= 0) {
    const days = Math.max(0, differenceInCalendarDays(new Date(), start))
    return days === 1 ? '1 día' : `${days} días`
  }
  const y = Math.floor(months / 12)
  const m = months % 12
  const parts: string[] = []
  if (y) parts.push(y === 1 ? '1 año' : `${y} años`)
  if (m) parts.push(m === 1 ? '1 mes' : `${m} meses`)
  return parts.join(' ')
}

/** Número de proyecto con el formato de las guías: AAMMDD (ej. 261003). */
export function projectNumberFromDate(d: string): string {
  if (!d || d.length < 10) return ''
  return d.slice(2, 4) + d.slice(5, 7) + d.slice(8, 10)
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, '')
}
