import { AdminLayout } from '@/components/AdminLayout'
import { LongTermBookings } from '@/components/LongTermBookings'

export default function LongTermPage() {
  return (
    <AdminLayout title="Långtidsbokningar" sub="Boka chaufförer för längre perioder, t.ex. sommarvikariat.">
      <LongTermBookings />
    </AdminLayout>
  )
}
