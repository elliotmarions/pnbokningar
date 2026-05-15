import { AdminLayout } from '@/components/AdminLayout'
import { WeekConfig } from '@/components/WeekConfig'

export default function AdminConfigPage() {
  return (
    <AdminLayout title="Schemalägg" sub="Konfigurera platser och öppna dagar.">
      <WeekConfig />
    </AdminLayout>
  )
}
