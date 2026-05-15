import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { DriverHome } from '@/components/DriverHome'

export default async function DriverPage() {
  const session = await getSession()
  if (!session?.user) redirect('/')
  return <DriverHome />
}
