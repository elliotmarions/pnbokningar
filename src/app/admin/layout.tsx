import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin()
  if (!session) redirect('/')
  return <>{children}</>
}
