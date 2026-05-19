import { AdminLayout } from '@/components/AdminLayout'
import { AdminCalendar } from '@/components/AdminCalendar'

export default function CalendarPage() {
  return (
    <AdminLayout title="Kalender" sub="Röda dagar, aftnar och egna stängda dagar då vi inte kör pass.">
      <AdminCalendar />
    </AdminLayout>
  )
}
