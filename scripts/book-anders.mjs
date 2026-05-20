// Book fake driver Anders Lindqvist (test-driver-01) on a few more upcoming open days
import postgres from 'postgres'

const DATABASE_URL = 'postgresql://postgres.knmlabblsanvfhaulbhw:mT3jXyt36JWV3Wwy@aws-0-eu-west-1.pooler.supabase.com:6543/postgres'

const sql = postgres(DATABASE_URL, { ssl: 'require', prepare: false })

const USER_ID = 'test-driver-01'  // Anders Lindqvist
const ADMIN_ID_FALLBACK = 'system'

// Pick some specific dates to book him on
const DATES = ['2026-05-27', '2026-05-28', '2026-05-29', '2026-06-01', '2026-06-03']

try {
  // Ensure the user exists
  const [user] = await sql`SELECT id, name FROM users WHERE id = ${USER_ID}`
  if (!user) {
    console.error(`User ${USER_ID} not found.`)
    process.exit(1)
  }
  console.log(`Booking ${user.name}...`)

  // Find an admin user to attribute the approval to
  let adminId = ADMIN_ID_FALLBACK
  const [admin] = await sql`SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1`
  if (admin) adminId = admin.id

  let booked = 0
  for (const date of DATES) {
    const [shift] = await sql`SELECT id, is_open FROM shifts WHERE date = ${date}`
    if (!shift) { console.log(`  ${date}: no shift, skip`); continue }
    if (!shift.is_open) { console.log(`  ${date}: shift closed, skip`); continue }

    // Already applied?
    const [existing] = await sql`SELECT id FROM applications WHERE shift_id = ${shift.id} AND user_id = ${USER_ID}`
    let appId
    if (existing) {
      appId = existing.id
      // Make sure not on reserve / not rejected / not withdrawn
      await sql`UPDATE applications SET reserve = 0, rejected = 0, withdrawn = 0 WHERE id = ${appId}`
      console.log(`  ${date}: already applied (id ${appId}), reset flags`)
    } else {
      const [app] = await sql`INSERT INTO applications (shift_id, user_id, reserve) VALUES (${shift.id}, ${USER_ID}, 0) RETURNING id`
      appId = app.id
      console.log(`  ${date}: applied (id ${appId})`)
    }

    // Approve (insert into approvals, idempotent)
    const [appr] = await sql`SELECT id FROM approvals WHERE application_id = ${appId}`
    if (!appr) {
      await sql`INSERT INTO approvals (application_id, approved_by) VALUES (${appId}, ${adminId})`
      console.log(`    → approved`)
      booked++
    } else {
      console.log(`    → already approved`)
    }
  }
  console.log(`\nDone. ${booked} new bookings for ${user.name}.`)
} finally {
  await sql.end()
}
