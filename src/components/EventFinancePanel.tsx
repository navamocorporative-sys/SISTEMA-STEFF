import { useState, type FormEvent } from 'react'
import { Plus, Trash2, CheckCircle2, Circle } from 'lucide-react'
import { Card, EmptyState, ErrorBlock, LoadingBlock, Modal, Field, StatCard, Badge } from './ui'
import { useQuery } from '../hooks/useQuery'
import { supabase, must } from '../lib/supabase'
import { EVENT_EXPENSE_CATEGORIES, PAYMENT_CONCEPTS, PAYMENT_METHODS, optionLabel } from '../lib/constants'
import { fmtDate, fmtMoney, num, todayISO } from '../lib/format'
import type { AssignmentWithStaff, EventPayment, EventRow, Expense, PaymentConcept, Supplier } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'

interface PanelData {
  payments: EventPayment[]
  assignments: AssignmentWithStaff[]
  expenses: Expense[]
  suppliers: Pick<Supplier, 'id' | 'name'>[]
}

/** Registro de venta, pagos, inversión y ganancia de un evento (solo administrador). */
export default function EventFinancePanel({ event, onChanged }: { event: EventRow; onChanged?: () => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [payOpen, setPayOpen] = useState(false)
  const [expOpen, setExpOpen] = useState(false)
  const [editExp, setEditExp] = useState<Expense | null>(null)

  const q = useQuery<PanelData>(async () => {
    const [payments, assignments, expenses, suppliers] = await Promise.all([
      must<EventPayment[]>(supabase.from('event_payments').select('*').eq('event_id', event.id).order('paid_on')),
      must<AssignmentWithStaff[]>(supabase.from('assignments').select('*, staff(id, full_name, phone, roles)').eq('event_id', event.id).order('created_at')),
      must<Expense[]>(supabase.from('expenses').select('*').eq('event_id', event.id).order('expense_date')),
      must<Pick<Supplier, 'id' | 'name'>[]>(supabase.from('suppliers').select('id, name').order('name')),
    ])
    return { payments, assignments, expenses, suppliers }
  }, [event.id])

  if (q.loading && !q.data) return <LoadingBlock />
  if (q.error || !q.data) return <ErrorBlock message={q.error ?? 'Error'} onRetry={q.reload} />

  const { payments, assignments, expenses, suppliers } = q.data
  const total = num(event.total_amount)
  const paid = payments.reduce((s, p) => s + num(p.amount), 0)
  const teamCost = assignments.reduce((s, a) => s + num(a.payment), 0)
  const teamUnpaid = assignments.filter((a) => !a.paid).reduce((s, a) => s + num(a.payment), 0)
  const otherCost = expenses.reduce((s, x) => s + num(x.amount), 0)
  const otherUnpaid = expenses.filter((x) => !x.paid).reduce((s, x) => s + num(x.amount), 0)
  const investment = teamCost + otherCost
  const profit = total - investment
  const changed = () => {
    void q.reload()
    onChanged?.()
  }

  const delPayment = async (p: EventPayment) => {
    if (!(await confirm({ title: 'Eliminar pago', text: `¿Eliminar el pago de ${fmtMoney(p.amount)}?` }))) return
    try {
      await must(supabase.from('event_payments').delete().eq('id', p.id).select('id'))
      toast.success('Pago eliminado')
      changed()
    } catch (e) {
      toast.error(e)
    }
  }

  const toggleTeamPaid = async (a: AssignmentWithStaff) => {
    try {
      await must(supabase.from('assignments').update({ paid: !a.paid, paid_on: !a.paid ? todayISO() : null }).eq('id', a.id).select('id').single())
      changed()
    } catch (e) {
      toast.error(e)
    }
  }

  const toggleExpPaid = async (x: Expense) => {
    try {
      await must(supabase.from('expenses').update({ paid: !x.paid, paid_on: !x.paid ? todayISO() : null }).eq('id', x.id).select('id').single())
      changed()
    } catch (e) {
      toast.error(e)
    }
  }

  const delExpense = async (x: Expense) => {
    if (!(await confirm({ title: 'Eliminar gasto', text: `¿Eliminar el gasto "${x.category}" de ${fmtMoney(x.amount)}?` }))) return
    try {
      await must(supabase.from('expenses').delete().eq('id', x.id).select('id'))
      toast.success('Gasto eliminado')
      changed()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Costo del servicio" value={fmtMoney(total)} />
        <StatCard label="Pagado" value={fmtMoney(paid)} tone="green" />
        <StatCard label="Saldo por cobrar" value={fmtMoney(Math.max(total - paid, 0))} tone={total - paid > 0 ? 'amber' : 'green'} />
        <StatCard label="Inversión total" value={fmtMoney(investment)} tone="blue" hint={teamUnpaid + otherUnpaid > 0 ? `Pendiente por pagar: ${fmtMoney(teamUnpaid + otherUnpaid)}` : 'Todo pagado'} />
        <StatCard label="Ganancia" value={fmtMoney(profit)} tone={profit >= 0 ? 'green' : 'red'} />
      </div>

      <Card
        title="Pagos del cliente"
        actions={
          <button className="btn-primary btn-sm" onClick={() => setPayOpen(true)}>
            <Plus className="h-4 w-4" /> Registrar pago
          </button>
        }
        bodyClass="p-0"
      >
        {payments.length === 0 ? (
          <EmptyState title="Sin pagos registrados" text="Registra el anticipo y los abonos del cliente." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Forma de pago</th>
                  <th className="text-right">Importe</th>
                  <th className="text-right">Saldo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => {
                  const bal = total - payments.slice(0, i + 1).reduce((s, x) => s + num(x.amount), 0)
                  return (
                    <tr key={p.id}>
                      <td>{fmtDate(p.paid_on)}</td>
                      <td>
                        {optionLabel(PAYMENT_CONCEPTS, p.concept)}
                        {p.notes && <span className="block text-xs text-slate-400">{p.notes}</span>}
                      </td>
                      <td>{p.method || '—'}</td>
                      <td className="text-right font-semibold">{fmtMoney(p.amount)}</td>
                      <td className="text-right">{fmtMoney(Math.max(bal, 0))}</td>
                      <td className="text-right">
                        <button className="btn-icon hover:text-red-600" onClick={() => void delPayment(p)} title="Eliminar">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Pago al equipo" bodyClass="p-0">
          {assignments.length === 0 ? (
            <EmptyState title="Sin equipo asignado" text="Asigna fotógrafo, videógrafo, dron, editores y vendedor en la pestaña “Equipo asignado”." />
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Función</th>
                  <th className="text-right">Monto</th>
                  <th className="text-center">Pagado</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td className="font-medium">{a.staff?.full_name ?? '—'}</td>
                    <td className="text-slate-600">{a.role}</td>
                    <td className="text-right">{fmtMoney(a.payment)}</td>
                    <td className="text-center">
                      <button className="btn-icon" onClick={() => void toggleTeamPaid(a)} title={a.paid ? 'Marcar como pendiente' : 'Marcar como pagado'}>
                        {a.paid ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-slate-300" />}
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} className="font-semibold">
                    Total equipo
                  </td>
                  <td className="text-right font-bold">{fmtMoney(teamCost)}</td>
                  <td className="text-center text-xs text-amber-700">{teamUnpaid > 0 ? `Debe ${fmtMoney(teamUnpaid)}` : ''}</td>
                </tr>
              </tbody>
            </table>
          )}
        </Card>

        <Card
          title="Otros gastos del evento"
          actions={
            <button
              className="btn-primary btn-sm"
              onClick={() => {
                setEditExp(null)
                setExpOpen(true)
              }}
            >
              <Plus className="h-4 w-4" /> Agregar gasto
            </button>
          }
          bodyClass="p-0"
        >
          {expenses.length === 0 ? (
            <EmptyState title="Sin gastos" text="Gasolina, comida, proveedores de fotografía, extras…" />
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th className="text-right">Monto</th>
                  <th className="text-center">Pagado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {expenses.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <button
                        className="text-left font-medium text-navy-800 hover:underline"
                        onClick={() => {
                          setEditExp(x)
                          setExpOpen(true)
                        }}
                      >
                        {x.category}
                      </button>
                      {x.concept && <span className="block text-xs text-slate-400">{x.concept}</span>}
                    </td>
                    <td className="text-right">{fmtMoney(x.amount)}</td>
                    <td className="text-center">
                      <button className="btn-icon" onClick={() => void toggleExpPaid(x)}>
                        {x.paid ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-slate-300" />}
                      </button>
                    </td>
                    <td className="text-right">
                      <button className="btn-icon hover:text-red-600" onClick={() => void delExpense(x)} title="Eliminar">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="font-semibold">Total gastos</td>
                  <td className="text-right font-bold">{fmtMoney(otherCost)}</td>
                  <td colSpan={2} className="text-center text-xs text-amber-700">
                    {otherUnpaid > 0 ? `Pendiente ${fmtMoney(otherUnpaid)}` : ''}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-slate-600">
          Ganancia = costo del servicio ({fmtMoney(total)}) − inversión ({fmtMoney(investment)})
        </p>
        <Badge tone={profit >= 0 ? 'green' : 'red'}>Ganancia: {fmtMoney(profit)}</Badge>
      </div>

      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} eventId={event.id} balance={Math.max(total - paid, 0)} hasPayments={payments.length > 0} onSaved={changed} />
      <ExpenseModal
        open={expOpen}
        onClose={() => setExpOpen(false)}
        eventId={event.id}
        expense={editExp}
        suppliers={suppliers}
        categories={EVENT_EXPENSE_CATEGORIES}
        onSaved={changed}
      />
    </div>
  )
}

function PaymentModal({
  open,
  onClose,
  eventId,
  balance,
  hasPayments,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  eventId: string
  balance: number
  hasPayments: boolean
  onSaved: () => void
}) {
  const toast = useToast()
  const [concept, setConcept] = useState<PaymentConcept>('abono')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [method, setMethod] = useState('Efectivo')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastOpen, setLastOpen] = useState(false)

  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setConcept(hasPayments ? 'abono' : 'anticipo')
      setAmount('')
      setDate(todayISO())
      setMethod('Efectivo')
      setNotes('')
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const v = Number(amount)
    if (!Number.isFinite(v) || v <= 0) return toast.error('Escribe un importe mayor a cero.')
    setSaving(true)
    try {
      await must(supabase.from('event_payments').insert({ event_id: eventId, concept, amount: v, paid_on: date || todayISO(), method, notes }).select('id').single())
      toast.success('Pago registrado')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar pago"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" type="submit" form="pay-form" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="pay-form" onSubmit={submit} className="space-y-4">
        <Field label="Concepto">
          <select className="input" value={concept} onChange={(e) => setConcept(e.target.value as PaymentConcept)}>
            {PAYMENT_CONCEPTS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Importe" hint={balance > 0 ? `Saldo pendiente: ${fmtMoney(balance)}` : undefined}>
          <div className="flex gap-2">
            <input className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            {balance > 0 && (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  setAmount(String(balance))
                  setConcept('liquidacion')
                }}
              >
                Liquidar
              </button>
            )}
          </div>
        </Field>
        <Field label="Fecha">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Forma de pago">
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Notas">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}

export function ExpenseModal({
  open,
  onClose,
  eventId,
  expense,
  suppliers,
  categories,
  defaultSupplierId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  eventId: string | null
  expense: Expense | null
  suppliers: Pick<Supplier, 'id' | 'name'>[]
  categories: string[]
  defaultSupplierId?: string | null
  onSaved: () => void
}) {
  const toast = useToast()
  const [category, setCategory] = useState(categories[0] ?? 'Otro')
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [paid, setPaid] = useState(true)
  const [supplierId, setSupplierId] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastKey, setLastKey] = useState<string | null>(null)

  const key = open ? `open-${expense?.id ?? 'new'}` : null
  if (key !== lastKey) {
    setLastKey(key)
    if (open) {
      setCategory(expense?.category ?? categories[0] ?? 'Otro')
      setConcept(expense?.concept ?? '')
      setAmount(expense ? String(expense.amount) : '')
      setDate(expense?.expense_date ?? todayISO())
      setPaid(expense?.paid ?? true)
      setSupplierId(expense?.supplier_id ?? defaultSupplierId ?? '')
      setNotes(expense?.notes ?? '')
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const v = Number(amount)
    if (!Number.isFinite(v) || v < 0) return toast.error('Escribe un monto válido.')
    if (!category.trim()) return toast.error('Escribe la categoría del gasto.')
    setSaving(true)
    try {
      const payload = {
        event_id: expense ? expense.event_id : eventId,
        supplier_id: supplierId || null,
        category: category.trim(),
        concept,
        amount: v,
        expense_date: date || todayISO(),
        paid,
        paid_on: paid ? expense?.paid_on ?? date ?? todayISO() : null,
        notes,
      }
      if (expense) await must(supabase.from('expenses').update(payload).eq('id', expense.id).select('id').single())
      else await must(supabase.from('expenses').insert(payload).select('id').single())
      toast.success(expense ? 'Gasto actualizado' : 'Gasto registrado')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={expense ? 'Editar gasto' : 'Registrar gasto'}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" type="submit" form="exp-form" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="exp-form" onSubmit={submit} className="space-y-4">
        <Field label="Categoría">
          <input className="input" list="exp-cats" value={category} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="exp-cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Descripción">
          <input className="input" value={concept} onChange={(e) => setConcept(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto">
            <input className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Fecha">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Proveedor (opcional)">
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— Ninguno —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          Ya está pagado
        </label>
        <Field label="Notas">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
