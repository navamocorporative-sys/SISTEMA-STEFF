import { useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, Circle, FileDown, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Card, EmptyState, ErrorBlock, Field, InfoRow, LoadingBlock, Modal, PageHeader, SearchInput, StatCard } from '../components/ui'
import { ExpenseModal } from '../components/EventFinancePanel'
import { useQuery } from '../hooks/useQuery'
import { supabase, must } from '../lib/supabase'
import { GENERAL_EXPENSE_CATEGORIES, SUPPLIER_CATEGORIES } from '../lib/constants'
import { fmtDate, fmtMoney, num, todayISO } from '../lib/format'
import { buildReportPdf } from '../lib/pdf/reportPdf'
import { fileSafe } from '../lib/pdf/engine'
import { downloadBlob } from '../lib/storage'
import { openWhatsApp } from '../lib/whatsapp'
import type { Expense, Supplier } from '../lib/types'
import { useSettings } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'

interface Stats {
  total: number
  unpaid: number
  month: number
  count: number
  last: string | null
}

export default function SuppliersPage() {
  const settings = useSettings()
  const toast = useToast()
  const confirm = useConfirm()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [viewing, setViewing] = useState<Supplier | null>(null)
  const [exporting, setExporting] = useState(false)

  const q = useQuery(async () => {
    const [suppliers, expenses] = await Promise.all([
      must<Supplier[]>(supabase.from('suppliers').select('*').order('name')),
      must<Expense[]>(supabase.from('expenses').select('*').not('supplier_id', 'is', null).order('expense_date', { ascending: false })),
    ])
    return { suppliers, expenses }
  }, [])

  const stats = useMemo(() => {
    const m = new Map<string, Stats>()
    const month = todayISO().slice(0, 7)
    for (const x of q.data?.expenses ?? []) {
      if (!x.supplier_id) continue
      const s = m.get(x.supplier_id) ?? { total: 0, unpaid: 0, month: 0, count: 0, last: null }
      s.total += num(x.amount)
      s.count += 1
      if (!x.paid) s.unpaid += num(x.amount)
      if (x.expense_date.startsWith(month)) s.month += num(x.amount)
      if (!s.last || x.expense_date > s.last) s.last = x.expense_date
      m.set(x.supplier_id, s)
    }
    return m
  }, [q.data])

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    const list = q.data?.suppliers ?? []
    return s ? list.filter((p) => `${p.name} ${p.category} ${p.contact_name} ${p.products}`.toLowerCase().includes(s)) : list
  }, [q.data, search])

  if (q.loading && !q.data) return <LoadingBlock />
  if (q.error || !q.data) return <ErrorBlock message={q.error ?? 'Error'} onRetry={q.reload} />

  const totals = [...stats.values()].reduce((a, s) => ({ total: a.total + s.total, unpaid: a.unpaid + s.unpaid, month: a.month + s.month }), { total: 0, unpaid: 0, month: 0 })
  const allSuppliers = q.data.suppliers

  const exportPdf = async () => {
    setExporting(true)
    try {
      const blob = await buildReportPdf({
        title: 'Resumen de proveedores',
        businessName: settings.business_name,
        kpis: [
          { label: 'Proveedores activos', value: String(allSuppliers.filter((s) => s.status === 'activo').length) },
          { label: 'Gastado este mes', value: fmtMoney(totals.month) },
          { label: 'Gastado total', value: fmtMoney(totals.total) },
          { label: 'Pendiente por pagar', value: fmtMoney(totals.unpaid) },
        ],
        tables: [
          {
            title: 'Proveedores',
            headers: ['Proveedor', 'Categoría', 'Contacto', 'Compras', 'Última compra', 'Total', 'Pendiente'],
            alignRight: [3, 5, 6],
            rows: allSuppliers.map((s) => {
              const st = stats.get(s.id)
              return [s.name, s.category, [s.contact_name, s.phone].filter(Boolean).join(' · '), String(st?.count ?? 0), st?.last ? fmtDate(st.last) : '—', fmtMoney(st?.total ?? 0), fmtMoney(st?.unpaid ?? 0)]
            }),
            totals: ['Total', '', '', '', '', fmtMoney(totals.total), fmtMoney(totals.unpaid)],
          },
        ],
      })
      downloadBlob(blob, 'Proveedores.pdf')
    } catch (e) {
      toast.error(e)
    } finally {
      setExporting(false)
    }
  }

  const remove = async (s: Supplier) => {
    if (!(await confirm({ title: 'Eliminar proveedor', text: `¿Eliminar a "${s.name}"? Sus gastos se conservan sin proveedor.` }))) return
    try {
      await must(supabase.from('suppliers').delete().eq('id', s.id).select('id'))
      toast.success('Proveedor eliminado')
      void q.reload()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle="Tus proveedores, cuánto les compras y qué está pendiente por pagar."
        actions={
          <>
            <button className="btn-secondary" onClick={() => void exportPdf()} disabled={exporting}>
              <FileDown className="h-4 w-4" /> {exporting ? 'Generando…' : 'Exportar PDF'}
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="h-4 w-4" /> Nuevo proveedor
            </button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Proveedores activos" value={allSuppliers.filter((s) => s.status === 'activo').length} />
        <StatCard label="Gastado este mes" value={fmtMoney(totals.month)} tone="blue" />
        <StatCard label="Gastado total" value={fmtMoney(totals.total)} />
        <StatCard label="Pendiente por pagar" value={fmtMoney(totals.unpaid)} tone={totals.unpaid > 0 ? 'amber' : 'green'} />
      </div>
      <div className="card">
        <div className="border-b border-slate-100 p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Nombre, categoría, productos…" />
        </div>
        {rows.length === 0 ? (
          <EmptyState title="Sin proveedores" text="Registra laboratorios, imprentas, renta de equipo, marcos y ampliaciones…" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Categoría</th>
                  <th>Contacto</th>
                  <th className="text-right">Compras</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Pendiente</th>
                  <th>Estatus</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const st = stats.get(s.id)
                  return (
                    <tr key={s.id} className="row-link" onClick={() => setViewing(s)}>
                      <td className="font-semibold">{s.name}</td>
                      <td>{s.category || '—'}</td>
                      <td className="text-sm">
                        {s.contact_name || '—'}
                        {s.phone && <span className="block text-xs text-slate-400">{s.phone}</span>}
                      </td>
                      <td className="text-right">{st?.count ?? 0}</td>
                      <td className="text-right font-medium">{fmtMoney(st?.total ?? 0)}</td>
                      <td className={`text-right ${st && st.unpaid > 0 ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>{fmtMoney(st?.unpaid ?? 0)}</td>
                      <td>
                        <Badge tone={s.status === 'activo' ? 'green' : 'gray'}>{s.status === 'activo' ? 'Activo' : 'Inactivo'}</Badge>
                      </td>
                      <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn-icon"
                          onClick={() => {
                            setEditing(s)
                            setFormOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button className="btn-icon hover:text-red-600" onClick={() => void remove(s)}>
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
      </div>

      <SupplierForm open={formOpen} onClose={() => setFormOpen(false)} supplier={editing} onSaved={() => void q.reload()} />
      {viewing && (
        <SupplierDetail
          supplier={viewing}
          expenses={q.data.expenses.filter((x) => x.supplier_id === viewing.id)}
          suppliers={allSuppliers}
          onClose={() => setViewing(null)}
          onChanged={() => void q.reload()}
        />
      )}
    </div>
  )
}

function SupplierDetail({
  supplier,
  expenses,
  suppliers,
  onClose,
  onChanged,
}: {
  supplier: Supplier
  expenses: Expense[]
  suppliers: Supplier[]
  onClose: () => void
  onChanged: () => void
}) {
  const settings = useSettings()
  const toast = useToast()
  const confirm = useConfirm()
  const [expOpen, setExpOpen] = useState(false)
  const [expEdit, setExpEdit] = useState<Expense | null>(null)
  const total = expenses.reduce((s, x) => s + num(x.amount), 0)
  const unpaid = expenses.filter((x) => !x.paid).reduce((s, x) => s + num(x.amount), 0)

  const toggle = async (x: Expense) => {
    try {
      await must(supabase.from('expenses').update({ paid: !x.paid, paid_on: !x.paid ? todayISO() : null }).eq('id', x.id).select('id').single())
      onChanged()
    } catch (e) {
      toast.error(e)
    }
  }
  const del = async (x: Expense) => {
    if (!(await confirm({ title: 'Eliminar compra', text: `¿Eliminar la compra de ${fmtMoney(x.amount)}?` }))) return
    try {
      await must(supabase.from('expenses').delete().eq('id', x.id).select('id'))
      onChanged()
    } catch (e) {
      toast.error(e)
    }
  }
  const pdf = async () => {
    try {
      const blob = await buildReportPdf({
        title: `Proveedor: ${supplier.name}`,
        subtitle: [supplier.category, supplier.contact_name, supplier.phone].filter(Boolean).join(' · '),
        businessName: settings.business_name,
        kpis: [
          { label: 'Compras', value: String(expenses.length) },
          { label: 'Total comprado', value: fmtMoney(total) },
          { label: 'Pendiente por pagar', value: fmtMoney(unpaid) },
        ],
        tables: [
          {
            title: 'Historial de compras',
            headers: ['Fecha', 'Categoría', 'Descripción', 'Pagado', 'Monto'],
            alignRight: [4],
            rows: expenses.map((x) => [fmtDate(x.expense_date, 'dd/MM/yy'), x.category, x.concept, x.paid ? 'Sí' : 'No', fmtMoney(x.amount)]),
            totals: ['', '', '', 'Total', fmtMoney(total)],
          },
        ],
      })
      downloadBlob(blob, `Proveedor_${fileSafe(supplier.name)}.pdf`)
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <Modal open onClose={onClose} title={supplier.name} size="lg">
      <div className="mb-4 flex flex-wrap gap-2">
        {supplier.phone && (
          <button className="btn-whatsapp btn-sm" onClick={() => openWhatsApp(supplier.phone, `Hola ${supplier.contact_name || supplier.name}, `, settings.whatsapp_country_code)}>
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </button>
        )}
        <button className="btn-secondary btn-sm" onClick={() => void pdf()}>
          <FileDown className="h-4 w-4" /> PDF
        </button>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <dl className="divide-y divide-slate-100">
          <InfoRow label="Categoría">{supplier.category}</InfoRow>
          <InfoRow label="Contacto">{supplier.contact_name}</InfoRow>
          <InfoRow label="Teléfono">{supplier.phone}</InfoRow>
          <InfoRow label="Correo">{supplier.email}</InfoRow>
          <InfoRow label="Dirección">{supplier.address}</InfoRow>
          <InfoRow label="Sitio web">{supplier.website}</InfoRow>
        </dl>
        <dl className="divide-y divide-slate-100">
          <InfoRow label="Productos / servicios">{supplier.products}</InfoRow>
          <InfoRow label="Condiciones de pago">{supplier.payment_terms}</InfoRow>
          <InfoRow label="Notas">{supplier.notes}</InfoRow>
          <InfoRow label="Total comprado">{fmtMoney(total)}</InfoRow>
          <InfoRow label="Pendiente por pagar">{fmtMoney(unpaid)}</InfoRow>
        </dl>
      </div>
      <Card
        className="mt-6"
        title="Compras y pagos"
        actions={
          <button
            className="btn-primary btn-sm"
            onClick={() => {
              setExpEdit(null)
              setExpOpen(true)
            }}
          >
            <Plus className="h-4 w-4" /> Registrar compra
          </button>
        }
        bodyClass="p-0"
      >
        {expenses.length === 0 ? (
          <EmptyState title="Sin compras registradas" />
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto</th>
                <th className="text-right">Monto</th>
                <th className="text-center">Pagado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {expenses.map((x) => (
                <tr key={x.id}>
                  <td>{fmtDate(x.expense_date)}</td>
                  <td>
                    <p className="font-medium">{x.category}</p>
                    {x.concept && <p className="text-xs text-slate-400">{x.concept}</p>}
                    {x.event_id && <p className="text-xs text-navy-600">Gasto de evento</p>}
                  </td>
                  <td className="text-right font-semibold">{fmtMoney(x.amount)}</td>
                  <td className="text-center">
                    <button className="btn-icon" onClick={() => void toggle(x)}>
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
                    <button className="btn-icon hover:text-red-600" onClick={() => void del(x)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <ExpenseModal
        open={expOpen}
        onClose={() => setExpOpen(false)}
        eventId={null}
        expense={expEdit}
        suppliers={suppliers}
        categories={GENERAL_EXPENSE_CATEGORIES}
        defaultSupplierId={supplier.id}
        onSaved={onChanged}
      />
    </Modal>
  )
}

type SupplierFormState = Omit<Supplier, 'id' | 'created_at'>

const emptySupplier = (): SupplierFormState => ({
  name: '',
  category: '',
  contact_name: '',
  phone: '',
  email: '',
  address: '',
  website: '',
  products: '',
  payment_terms: '',
  status: 'activo',
  notes: '',
})

function SupplierForm({ open, onClose, supplier, onSaved }: { open: boolean; onClose: () => void; supplier: Supplier | null; onSaved: () => void }) {
  const toast = useToast()
  const [f, setF] = useState<SupplierFormState>(emptySupplier())
  const [saving, setSaving] = useState(false)
  const [lastKey, setLastKey] = useState<string | null>(null)
  const key = open ? supplier?.id ?? 'new' : null
  if (key !== lastKey) {
    setLastKey(key)
    if (open) {
      if (supplier) {
        const { id: _id, created_at: _c, ...rest } = supplier
        void _id
        void _c
        setF(rest)
      } else setF(emptySupplier())
    }
  }
  const set = <K extends keyof SupplierFormState>(k: K, v: SupplierFormState[K]) => setF((p) => ({ ...p, [k]: v }))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) return toast.error('Escribe el nombre del proveedor.')
    setSaving(true)
    try {
      const payload = { ...f, name: f.name.trim() }
      if (supplier) await must(supabase.from('suppliers').update(payload).eq('id', supplier.id).select('id').single())
      else await must(supabase.from('suppliers').insert(payload).select('id').single())
      toast.success('Proveedor guardado')
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
      title={supplier ? 'Editar proveedor' : 'Nuevo proveedor'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" type="submit" form="sup-form" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="sup-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre" required>
          <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Categoría">
          <input className="input" list="sup-cats" value={f.category} onChange={(e) => set('category', e.target.value)} />
          <datalist id="sup-cats">
            {SUPPLIER_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Persona de contacto">
          <input className="input" value={f.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
        </Field>
        <Field label="Teléfono / WhatsApp">
          <input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Correo">
          <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Sitio web / red social">
          <input className="input" value={f.website} onChange={(e) => set('website', e.target.value)} />
        </Field>
        <Field label="Dirección" className="sm:col-span-2">
          <input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="Productos / servicios" className="sm:col-span-2">
          <textarea className="input min-h-[60px]" value={f.products} onChange={(e) => set('products', e.target.value)} />
        </Field>
        <Field label="Condiciones de pago">
          <input className="input" value={f.payment_terms} onChange={(e) => set('payment_terms', e.target.value)} />
        </Field>
        <Field label="Estatus">
          <select className="input" value={f.status} onChange={(e) => set('status', e.target.value as Supplier['status'])}>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </Field>
        <Field label="Notas" className="sm:col-span-2">
          <textarea className="input min-h-[60px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
