import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { AdminCacheProvider } from '@/components/AdminCacheProvider'

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin()
  if (!session) redirect('/')
  // AdminCacheProvider is a Client Component nested inside a Server Component —
  // valid pattern in App Router. The provider stays mounted across all child
  // route changes so its cache survives every tab navigation.
  return <AdminCacheProvider>{children}</AdminCacheProvider>
}
