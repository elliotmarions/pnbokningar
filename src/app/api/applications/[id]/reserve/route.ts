import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getDb } from '@/lib/db'

// POST /api/applications/[id]/reserve
// Moves an application to the reserve list. Works for both pending and
// already-approved drivers — when moving an approved driver, the approval
// row is deleted so they end up purely on the reserve list.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const appId = parseInt(id)
  const sql = getDb()

  const [app] = await sql<{ reserve: number; rejected: number; withdrawn: number }[]>`
    SELECT reserve, rejected, withdrawn FROM applications WHERE id = ${appId}
  `
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (app.reserve === 1) return NextResponse.json({ ok: true }) // already reserve

  await sql.begin(async tx => {
    // Remove any approval so the driver isn't both approved AND reserve.
    await tx`DELETE FROM approvals WHERE application_id = ${appId}`
    // Clear withdrawn/rejected flags too — moving to reserve is a fresh state.
    await tx`
      UPDATE applications
      SET reserve = 1, withdrawn = 0, withdrawal_reason = NULL, rejected = 0, rejection_reason = NULL
      WHERE id = ${appId}
    `
  })
  return NextResponse.json({ ok: true })
}
