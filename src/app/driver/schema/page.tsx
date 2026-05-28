import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { MySchedule } from '@/components/MySchedule'

export default async function DriverSchemaPage() {
  const session = await getSession()
  if (!session?.user) redirect('/')
  if (!session.user.phone || session.user.phone.trim() === '') redirect('/profile/phone')
  return <MySchedule />
}
