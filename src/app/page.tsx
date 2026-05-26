import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { Login } from '@/components/Login'

export default async function RootPage() {
  const session = await getSession()
  if (session?.user) {
    // Force phone collection at first login.
    if (!session.user.phone || session.user.phone.trim() === '') redirect('/profile/phone')
    redirect(session.user.role === 'admin' ? '/admin' : '/driver')
  }
  return <Login />
}
