import { AdminLayout } from '@/components/AdminLayout'
import { AdminWeek } from '@/components/AdminWeek'

export default function AdminPage() {
  return (
    <AdminLayout title="Veckoöversikt" sub="Pass, sökande och godkännanden för aktuell vecka.">
      <AdminWeek />
    </AdminLayout>
  )
}
