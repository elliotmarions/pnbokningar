import { AdminLayout } from '@/components/AdminLayout'
import { ExportView } from '@/components/ExportView'

export default function AdminExportPage() {
  return (
    <AdminLayout title="Statistik" sub="Sammanställ data för rapportering.">
      <ExportView />
    </AdminLayout>
  )
}
