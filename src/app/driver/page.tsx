import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { DriverHome } from '@/components/DriverHome'

export default async function DriverPage() {
  const session = await getSession()
  if (!session?.user) redirect('/')
  // First-login: force phone number entry before letting the user in.
  if (!session.user.phone || session.user.phone.trim() === '') redirect('/profile/phone')
  return <DriverHome />
}
