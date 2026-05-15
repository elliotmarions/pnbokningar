import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { Login } from '@/components/Login'

export default async function RootPage() {
  const session = await getSession()
  if (session?.user) {
    const role = (session.user as Record<string, unknown>).role
    redirect(role === 'admin' ? '/admin' : '/driver')
  }
  const azureEnabled = !!(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_TENANT_ID)
  return <Login azureEnabled={azureEnabled} />
}
