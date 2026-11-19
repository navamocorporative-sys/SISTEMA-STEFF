import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, FileDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Card, EmptyState, ErrorBlock, LoadingBlock, Modal, PageHeader, StatCard, Tabs } from '../../components/ui'
import EventFinancePanel, { ExpenseModal } from '../../components/EventFinancePanel'
import { useQuery } from '../../hooks/useQuery'
import { supabase, must } from '../../lib/supabase'
import { listEventFinance, listEvents } from '../../lib/data'
import { DELIVERY_STATUS, EVENT_STATUS, GENERAL_EXPENSE_CATEGORIES, optionLabel, optionTone } from '../../lib/constants'
import { fmtDate, fmtMoney, num, todayISO } from '../../lib/format'
import { buildReportPdf } from '../../lib/pdf/reportPdf'
import { downloadBlob } from '../../lib/storage'
import type { AdCampaign, Delivery, EventWithClient, Expense, Supplier } from '../../lib/types'
import { useSettings } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'

type Mode = 'mes' | 'anio' | 'todo'
type TabKey = 'resumen' | 'eventos' | 'gastos'

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function FinancePage() {
  const settings = useSettings()
  const toast = useToast()
  const confirm = useConfirm()
  const [mode, setMode] = useState<Mode>('mes')
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [year, setYear] = useState(todayISO().slice(0, 4))
  const [tab, setTab] = useState<TabKey>('resumen')
  const [detail, setDetail] = useState<EventWithClient | null>(null)
  const [expOpen, setExpOpen] = useState(false)
  const [expEdit, setExpEdit] = useState<Expense | null>(null)
  const [exporting, setExporting] = useState(false)

  const q = useQuery(async () => {
    const [events, fin, expenses, campaigns, suppliers, deliveries] = await Promise.all([
      listEvents(),
      listEventFinance(),
      must<Expense[]>(supabase.from('expenses').select('*').order('expense_date', { ascending: false })),
      must<AdCampaign[]>(supabase.from('ad_campaigns').select('*')),
      must<Pick<Supplier, 'id' | 'name'>[]>(supabase.from('suppliers').select('id, name').order('name')),
      must<Pick<Delivery, 'event_id' | 'status'>[]>(supabase.from('deliveries').select('event_id, status')),
    ])
    return { events, fin, expenses, campaigns, suppliers, deliveries }
  }, [])

  const inPeriod = (date: string | null | undefined): boolean => {
    if (!date) return false
    if (mode === 'mes') return date.startsWith(month)
    if (mode === 'anio') return date.startsWith(year)
    return true
  }

  const periodLabel = mode === 'mes' ? `${MONTHS[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(0, 4)}` : mode === 'anio' ? `Año ${year}` : 'Todo el historial'

  const calc = useMemo(() => {
    if (!q.data) return null
    const { events, fin, expenses, campaigns, deliveries } = q.data
    const pendingDelivery = new Set(deliveries.filter((d) => d.status !== 'entregado').map((d) => d.event_id))
    const evs = events.filter((e) => e.status !== 'cancelado' && inPeriod(e.event_date)).sort((a, b) => a.event_date.localeCompare(b.event_date))
    const rows = evs.map((e) => {
      const f = fin.get(e.id)
      return {
        e,
        total: num(e.total_amount),
        paid: num(f?.paid),
        balance: num(f?.balance),
        investment: num(f?.investment),
        unpaid: num(f?.team_unpaid) + num(f?.other_unpaid),
        profit: num(f?.profit),
        pendingDelivery: pendingDelivery.has(e.id),
      }
    })
    const sum = (k: 'total' | 'paid' | 'balance' | 'investment' | 'unpaid' | 'profit') => rows.reduce((s, r) => s + r[k], 0)
    const general = expenses.filter((x) => !x.event_id && inPeriod(x.expense_date))
    const generalTotal = general.reduce((s, x) => s + num(x.amount), 0)
    const generalUnpaid = general.filter((x) => !x.paid).reduce((s, x) => s + num(x.amount), 0)
    const ads = campaigns.filter((c) => inPeriod(c.start_date)).reduce((s, c) => s + num(c.spent), 0)
    const pendingInvestment = rows.filter((r) => r.pendingDelivery).reduce((s, r) => s + r.unpaid, 0)

    // Ganancia acumulada (todo el historial)
    let allProfit = 0
    for (const e of events) if (e.status !== 'cancelado') allProfit += num(fin.get(e.id)?.profit)
    const allGeneral = expenses.filter((x) => !x.event_id).reduce((s, x) => s + num(x.amount), 0)
    const allAds = campaigns.reduce((s, c) => s + num(c.spent), 0)

    // Desglose: por semana (mes) o por mes (año / todo)
    const buckets = new Map<string, { label: string; count: number; total: number; investment: number; profit: number }>()
    for (const r of rows) {
      let key: string
      let label: string
      if (mode === 'mes') {
        const day = Number(r.e.event_date.slice(8, 10))
        const w = Math.min(5, Math.floor((day - 1) / 7) + 1)
        key = String(w)
        label = `Semana ${w} (${(w - 1) * 7 + 1}–${w === 5 ? 'fin' : w * 7})`
      } else {
        key = r.e.event_date.slice(0, 7)
        label = `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
      }
      const b = buckets.get(key) ?? { label, count: 0, total: 0, investment: 0, profit: 0 }
      b.count += 1
      b.total += r.total
      b.investment += r.investment
      b.profit += r.profit
      buckets.set(key, b)
    }
    const breakdown = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v)

    return {
      rows,
      sales: sum('total'),
      paid: sum('paid'),
      balance: sum('balance'),
      investment: sum('investment'),
      unpaid: sum('unpaid'),
      profit: sum('profit'),
      general,
      generalTotal,
      generalUnpaid,
      ads,
      pendingInvestment,
      net: sum('profit') - generalTotal - ads,
      allNet: allProfit - allGeneral - allAds,
      breakdown,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, mode, month, year])

  const years = useMemo(() => {
    const set = new Set<string>([todayISO().slice(0, 4)])
    for (const e of q.data?.events ?? []) set.add(e.event_date.slice(0, 4))
    return [...set].sort().reverse()
  }, [q.data])

  if (q.loading && !q.data) return <LoadingBlock />
  if (q.error || !q.data || !calc) return <ErrorBlock message={q.error ?? 'Error'} onRetry={q.reload} />

  const supplierName = new Map(q.data.suppliers.map((s) => [s.id, s.name]))

  const exportPdf = async () => {
    setExporting(true)
    try {
      const blob = await buildReportPdf({
        title: 'Resumen financiero',
        subtitle: periodLabel,
        businessName: settings.business_name,
        landscape: true,
        kpis: [
          { label: 'Ventas', value: fmtMoney(calc.sales) },
          { label: 'Cobrado', value: fmtMoney(calc.paid) },
          { label: 'Por cobrar', value: fmtMoney(calc.balance) },
          { label: 'Inversión en eventos', value: fmtMoney(calc.investment) },
          { label: 'Inversión pendiente', value: fmtMoney(calc.unpaid) },
          { label: 'Ganancia de eventos', value: fmtMoney(calc.profit) },
          { label: 'Gastos generales', value: fmtMoney(calc.generalTotal) },
          { label: 'Publicidad', value: fmtMoney(calc.ads) },
          { label: 'Ganancia neta del periodo', value: fmtMoney(calc.net) },
          { label: 'Ganancia total acumulada', value: fmtMoney(calc.allNet) },
        ],
        tables: [
          {
            title: mode === 'mes' ? 'Ganancia por semana' : 'Ganancia por mes',
            headers: ['Periodo', 'Eventos', 'Ventas', 'Inversión', 'Ganancia'],
            alignRight: [1, 2, 3, 4],
            rows: calc.breakdown.map((b) => [b.label, String(b.count), fmtMoney(b.total), fmtMoney(b.investment), fmtMoney(b.profit)]),
            totals: ['Total', String(calc.rows.length), fmtMoney(calc.sales), fmtMoney(calc.investment), fmtMoney(calc.profit)],
          },
          {
            title: 'Inversión y ganancia por evento',
            headers: ['Fecha', 'Proyecto', 'Cliente', 'Evento', 'Venta', 'Cobrado', 'Saldo', 'Inversión', 'Pendiente pagar', 'Ganancia'],
            alignRight: [4, 5, 6, 7, 8, 9],
            widths: [52, 48, '*', 70, 58, 58, 58, 58, 60, 58],
            rows: calc.rows.map((r) => [
              fmtDate(r.e.event_date, 'dd/MM/yy'),
              r.e.project_number,
              r.e.clients?.full_name ?? '',
              r.e.event_type,
              fmtMoney(r.total),
              fmtMoney(r.paid),
              fmtMoney(r.balance),
              fmtMoney(r.investment),
              fmtMoney(r.unpaid),
              fmtMoney(r.profit),
            ]),
            totals: ['', '', 'Totales', '', fmtMoney(calc.sales), fmtMoney(calc.paid), fmtMoney(calc.balance), fmtMoney(calc.investment), fmtMoney(calc.unpaid), fmtMoney(calc.profit)],
          },
          {
            title: 'Gastos generales',
            headers: ['Fecha', 'Categoría', 'Descripción', 'Proveedor', 'Pagado', 'Monto'],
            alignRight: [5],
            rows: calc.general.map((x) => [
              fmtDate(x.expense_date, 'dd/MM/yy'),
              x.category,
              x.concept,
              x.supplier_id ? supplierName.get(x.supplier_id) ?? '' : '',
              x.paid ? 'Sí' : 'No',
              fmtMoney(x.amount),
            ]),
            totals: ['', '', '', '', 'Total', fmtMoney(calc.generalTotal)],
          },
        ],
      })
      downloadBlob(blob, `Finanzas_${periodLabel.replace(/\s+/g, '_')}.pdf`)
    } catch (e) {
      toast.error(e)
    } finally {
      setExporting(false)
    }
  }

  const toggleExp = async (x: Expense) => {
    try {
      await must(supabase.from('expenses').update({ paid: !x.paid, paid_on: !x.paid ? todayISO() : null }).eq('id', x.id).select('id').single())
      void q.reload()
    } catch (e) {
      toast.error(e)
    }
  }

  const delExp = async (x: Expense) => {
    if (!(await confirm({ title: 'Eliminar gasto', text: `¿Eliminar el gasto de ${fmtMoney(x.amount)}?` }))) return
    try {
      await must(supabase.from('expenses').delete().eq('id', x.id).select('id'))
      toast.success('Gasto eliminado')
      void q.reload()
    } catch (e) {
      toast.error(e)
    }
  }

  const maxProfit = Math.max(1, ...calc.breakdown.map((b) => Math.abs(b.profit)))

  return (
    <div>
      <PageHeader
        title="Finanzas"
        subtitle="Registro de inversión y ganancias por evento."
        actions={
          <button className="btn-primary" onClick={() => void exportPdf()} disabled={exporting}>
            <FileDown className="h-4 w-4" /> {exporting ? 'Generando…' : 'Exportar PDF'}
          </button>
        }
      />

      <div className="card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          {(
            [
              ['mes', 'Mes'],
              ['anio', 'Año'],
              ['todo', 'Todo'],
            ] as [Mode, string][]
          ).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setMode(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${mode === v ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500'}`}
            >
              {l}
            </button>
          ))}
        </div>
        {mode === 'mes' && <input type="month" className="input w-auto" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />}
        {mode === 'anio' && (
          <select className="input w-auto" value={year} onChange={(e) => setYear(e.target.value)}>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        )}
        <p className="text-sm font-semibold text-navy-800 sm:ml-auto">{periodLabel}</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Ventas" value={fmtMoney(calc.sales)} hint={`${calc.rows.length} evento(s)`} />
        <StatCard label="Cobrado" value={fmtMoney(calc.paid)} tone="green" />
        <StatCard label="Por cobrar" value={fmtMoney(calc.balance)} tone="amber" />
        <StatCard label="Inversión" value={fmtMoney(calc.investment)} tone="blue" hint={`Pendiente por pagar: ${fmtMoney(calc.unpaid)}`} />
        <StatCard label="Inversión pendiente (entregas pendientes)" value={fmtMoney(calc.pendingInvestment)} tone="amber" />
        <StatCard label="Gastos generales + publicidad" value={fmtMoney(calc.generalTotal + calc.ads)} tone="red" />
        <StatCard label="Ganancia neta del periodo" value={fmtMoney(calc.net)} tone={calc.net >= 0 ? 'green' : 'red'} />
        <StatCard label="Ganancia total hasta hoy" value={fmtMoney(calc.allNet)} tone={calc.allNet >= 0 ? 'green' : 'red'} />
      </div>

      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'resumen', label: mode === 'mes' ? 'Ganancia por semana' : 'Ganancia por mes' },
          { value: 'eventos', label: 'Por evento' },
          { value: 'gastos', label: 'Gastos generales' },
        ]}
      />

      {tab === 'resumen' && (
        <Card bodyClass="p-0">
          {calc.breakdown.length === 0 ? (
            <EmptyState title="Sin eventos en este periodo" />
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th className="text-right">Eventos</th>
                  <th className="text-right">Ventas</th>
                  <th className="text-right">Inversión</th>
                  <th className="text-right">Ganancia</th>
                  <th className="hidden w-1/3 md:table-cell" />
                </tr>
              </thead>
              <tbody>
                {calc.breakdown.map((b) => (
                  <tr key={b.label}>
                    <td className="font-semibold">{b.label}</td>
                    <td className="text-right">{b.count}</td>
                    <td className="text-right">{fmtMoney(b.total)}</td>
                    <td className="text-right">{fmtMoney(b.investment)}</td>
                    <td className={`text-right font-bold ${b.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmtMoney(b.profit)}</td>
                    <td className="hidden md:table-cell">
                      <div className="h-2.5 w-full rounded-full bg-slate-100">
                        <div className={`h-2.5 rounded-full ${b.profit >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${(Math.abs(b.profit) / maxProfit) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50">
                  <td className="font-bold">Total</td>
                  <td className="text-right font-bold">{calc.rows.length}</td>
                  <td className="text-right font-bold">{fmtMoney(calc.sales)}</td>
                  <td className="text-right font-bold">{fmtMoney(calc.investment)}</td>
                  <td className="text-right font-bold text-navy-900">{fmtMoney(calc.profit)}</td>
                  <td className="hidden md:table-cell" />
                </tr>
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'eventos' && (
        <Card bodyClass="p-0">
          {calc.rows.length === 0 ? (
            <EmptyState title="Sin eventos en este periodo" />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Evento</th>
                    <th className="text-right">Venta</th>
                    <th className="text-right">Cobrado</th>
                    <th className="text-right">Saldo</th>
                    <th className="text-right">Inversión</th>
                    <th className="text-right">Pendiente pagar</th>
                    <th className="text-right">Ganancia</th>
                    <th>Entrega</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {calc.rows.map((r) => (
                    <tr key={r.e.id} className="row-link" onClick={() => setDetail(r.e)}>
                      <td>
                        <p className="font-semibold">{r.e.clients?.full_name ?? '—'}</p>
                        <p className="text-xs text-slate-500">
                          {r.e.event_type} · {fmtDate(r.e.event_date)} · {r.e.project_number}
                        </p>
                      </td>
                      <td className="text-right">{fmtMoney(r.total)}</td>
                      <td className="text-right text-emerald-700">{fmtMoney(r.paid)}</td>
                      <td className={`text-right ${r.balance > 0 ? 'text-amber-700' : ''}`}>{fmtMoney(r.balance)}</td>
                      <td className="text-right">{fmtMoney(r.investment)}</td>
                      <td className={`text-right ${r.unpaid > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{fmtMoney(r.unpaid)}</td>
                      <td className={`text-right font-bold ${r.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmtMoney(r.profit)}</td>
                      <td>
                        {r.pendingDelivery ? <Badge tone={optionTone(DELIVERY_STATUS, 'pendiente')}>Pendiente</Badge> : <Badge tone="green">Entregado</Badge>}
                      </td>
                      <td>
                        <Badge tone={optionTone(EVENT_STATUS, r.e.status)}>{optionLabel(EVENT_STATUS, r.e.status)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'gastos' && (
        <Card
          title="Gastos generales del negocio"
          actions={
            <button
              className="btn-primary btn-sm"
              onClick={() => {
                setExpEdit(null)
                setExpOpen(true)
              }}
            >
              <Plus className="h-4 w-4" /> Registrar gasto
            </button>
          }
          bodyClass="p-0"
        >
          {calc.general.length === 0 ? (
            <EmptyState title="Sin gastos generales en este periodo" text="Renta, software, equipo, proveedores… Los gastos de un evento se registran dentro del evento." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Categoría</th>
                    <th>Proveedor</th>
                    <th className="text-right">Monto</th>
                    <th className="text-center">Pagado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {calc.general.map((x) => (
                    <tr key={x.id}>
                      <td>{fmtDate(x.expense_date)}</td>
                      <td>
                        <p className="font-medium">{x.category}</p>
                        {x.concept && <p className="text-xs text-slate-400">{x.concept}</p>}
                      </td>
                      <td>{x.supplier_id ? supplierName.get(x.supplier_id) ?? '—' : '—'}</td>
                      <td className="text-right font-semibold">{fmtMoney(x.amount)}</td>
                      <td className="text-center">
                        <button className="btn-icon" onClick={() => void toggleExp(x)}>
                          {x.paid ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-slate-300" />}
                        </button>
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <button
                          className="btn-icon"
                          onClick={() => {
                            setExpEdit(x)
                            setExpOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button className="btn-icon hover:text-red-600" onClick={() => void delExp(x)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {detail && (
        <Modal open onClose={() => setDetail(null)} title={`${detail.event_type} · ${detail.clients?.full_name ?? ''} (${detail.project_number})`} size="xl">
          <div className="mb-4 flex justify-end">
            <Link className="btn-secondary btn-sm" to={`/eventos/${detail.id}`}>
              Abrir evento
            </Link>
          </div>
          <EventFinancePanel event={detail} onChanged={() => void q.reload()} />
        </Modal>
      )}

      <ExpenseModal
        open={expOpen}
        onClose={() => setExpOpen(false)}
        eventId={null}
        expense={expEdit}
        suppliers={q.data.suppliers}
        categories={GENERAL_EXPENSE_CATEGORIES}
        onSaved={() => void q.reload()}
      />
    </div>
  )
}
