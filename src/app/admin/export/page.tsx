import { AdminLayout } from '@/components/AdminLayout'
import { ExportView } from '@/components/ExportView'

export default function AdminExportPage() {
  return (
    <AdminLayout title="Export" sub="Sammanställ data för rapportering.">
      <ExportView />
    </AdminLayout>
  )
}
