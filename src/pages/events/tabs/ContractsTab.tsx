import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge, Card, EmptyState, ErrorBlock, LoadingBlock } from '../../../components/ui'
import { useQuery } from '../../../hooks/useQuery'
import { supabase, must } from '../../../lib/supabase'
import { CONTRACT_STATUS, optionLabel, optionTone } from '../../../lib/constants'
import { fmtDate, fmtMoney } from '../../../lib/format'
import type { Contract, EventRow } from '../../../lib/types'
import { useAuth } from '../../../context/AuthContext'

export default function ContractsTab({ event }: { event: EventRow }) {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const q = useQuery(() => must<Contract[]>(supabase.from('contracts').select('*').eq('event_id', event.id).order('created_at', { ascending: false })), [event.id])

  if (q.loading && !q.data) return <LoadingBlock />
  if (q.error || !q.data) return <ErrorBlock message={q.error ?? 'Error'} onRetry={q.reload} />

  return (
    <Card
      title="Contratos del evento"
      actions={
        isAdmin && (
          <Link className="btn-primary btn-sm" to={`/contratos/nuevo?evento=${event.id}`}>
            <Plus className="h-4 w-4" /> Nuevo contrato
          </Link>
        )
      }
      bodyClass="p-0"
    >
      {q.data.length === 0 ? (
        <EmptyState title="Sin contratos" text="Crea el contrato: se llena automáticamente con los datos del cliente y del evento." />
      ) : (
        <table className="table-base">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th className="text-right">Total</th>
              <th>Estatus</th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((c) => (
              <tr key={c.id} className="row-link" onClick={() => navigate(`/contratos/${c.id}`)}>
                <td className="font-mono text-xs">{String(c.folio).padStart(4, '0')}</td>
                <td>{fmtDate(c.contract_date)}</td>
                <td>{c.data.client_name}</td>
                <td className="text-right">{fmtMoney(c.data.total)}</td>
                <td>
                  <Badge tone={optionTone(CONTRACT_STATUS, c.status)}>{optionLabel(CONTRACT_STATUS, c.status)}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
