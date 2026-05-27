import { AdminLayout } from '@/components/AdminLayout'
import { DriversTable } from '@/components/DriversTable'

export default function AdminDriversPage() {
  return (
    <AdminLayout title="Personal" sub="Alla aktiva i din enhet.">
      <DriversTable />
    </AdminLayout>
  )
}
