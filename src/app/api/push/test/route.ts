import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { sendPushToUser } from '@/lib/push'

export async function POST() {
  const session = await requireUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await sendPushToUser(session.user.id, {
    title: 'Testnotis',
    body: 'Push-notiser är aktiverade. 🎉',
    url: '/',
  })

  return NextResponse.json({ ok: true })
}
