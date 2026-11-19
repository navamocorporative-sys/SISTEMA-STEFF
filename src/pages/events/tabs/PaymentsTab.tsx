import EventFinancePanel from '../../../components/EventFinancePanel'
import type { EventRow } from '../../../lib/types'

export default function PaymentsTab({ event }: { event: EventRow }) {
  return <EventFinancePanel event={event} />
}
