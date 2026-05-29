import { AdminLayout } from '@/components/AdminLayout'
import { ActivityLog } from '@/components/ActivityLog'

export default function AdminLogPage() {
  return (
    <AdminLayout title="Logg" sub="Alla bokningar, avbokningar och nekanden.">
      <ActivityLog />
    </AdminLayout>
  )
}
