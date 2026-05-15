import { AdminLayout } from '@/components/AdminLayout'
import { DriversTable } from '@/components/DriversTable'

export default function AdminDriversPage() {
  return (
    <AdminLayout title="Chaufförer" sub="Alla aktiva chaufförer i din enhet.">
      <DriversTable />
    </AdminLayout>
  )
}
