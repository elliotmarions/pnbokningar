import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { PhoneSetup } from '@/components/PhoneSetup'

/**
 * First-login phone collection page. Required before users can access
 * /driver or /admin. If they already have a phone on file, they're
 * redirected straight to their home view.
 */
export default async function PhoneSetupPage() {
  const session = await getSession()
  if (!session?.user) redirect('/')
  if (session.user.phone && session.user.phone.trim() !== '') {
    redirect(session.user.role === 'admin' ? '/admin' : '/driver')
  }
  const redirectTo = session.user.role === 'admin' ? '/admin' : '/driver'
  return <PhoneSetup userName={session.user.name ?? 'där'} redirectTo={redirectTo} />
}
