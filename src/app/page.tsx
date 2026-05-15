import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { Login } from '@/components/Login'

export default async function RootPage() {
  const session = await getSession()
  if (session?.user) {
    const role = (session.user as Record<string, unknown>).role
    redirect(role === 'admin' ? '/admin' : '/driver')
  }
  const devLogin = process.env.NEXTAUTH_DEV_LOGIN === 'true'
  return <Login devLogin={devLogin} />
}
