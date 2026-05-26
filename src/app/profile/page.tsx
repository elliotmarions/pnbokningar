import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { ProfilePage } from '@/components/ProfilePage'

export default async function Profile() {
  const session = await getSession()
  if (!session?.user) redirect('/')
  return (
    <ProfilePage
      name={session.user.name ?? 'Okänd'}
      email={session.user.email ?? null}
      role={session.user.role ?? 'driver'}
      phone={session.user.phone ?? null}
    />
  )
}
