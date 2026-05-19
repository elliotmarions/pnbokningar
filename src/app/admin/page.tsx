import { AdminLayout } from '@/components/AdminLayout'
import { AdminOverview } from '@/components/AdminOverview'

export default function AdminPage() {
  return (
    <AdminLayout title="Översikt" sub="Pass, sökande och godkännanden.">
      <AdminOverview />
    </AdminLayout>
  )
}
