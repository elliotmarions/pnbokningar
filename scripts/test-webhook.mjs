// Skicka en enda test-webhook till partnern och skriv ut exakt vad de svarar.
//
// Kör:
//   node scripts/test-webhook.mjs
//   node scripts/test-webhook.mjs --cancel          # booking.cancelled i stället
//   node scripts/test-webhook.mjs --id 3174         # annat bookingId
//
// URL och hemlighet läses från miljön (eller .env.local om du laddar den):
//   INTEGRATION_WEBHOOK_URL, INTEGRATION_WEBHOOK_SECRET
// eller som argument:
//   node scripts/test-webhook.mjs --url https://... --secret abc123
//
// Skriptet bygger och signerar bodyn EXAKT som src/lib/integration.ts gör, så
// ett svar här betyder samma sak som i produktion. Skickar du mot en partner i
// skarp drift: använd ett bookingId som inte finns (default 999999), annars
// riskerar du att röra en verklig bokning hos dem.

import crypto from 'crypto'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? undefined : args[i + 1]
}

const url = flag('url') ?? process.env.INTEGRATION_WEBHOOK_URL
const secret = flag('secret') ?? process.env.INTEGRATION_WEBHOOK_SECRET
const bookingId = Number(flag('id') ?? 999999)
const cancel = args.includes('--cancel')

if (!url) {
  console.error('Saknar URL. Sätt INTEGRATION_WEBHOOK_URL eller kör med --url https://...')
  process.exit(1)
}

const payload = {
  event: cancel ? 'booking.cancelled' : 'booking.confirmed',
  bookingId,
  driverName: 'Test Testsson',
  date: '2026-09-19',
  startTime: '09:45',
  endTime: '18:00',
}

// Samma ordning som produktionskoden: serialisera EN gång, signera den strängen,
// skicka exakt samma sträng.
const body = JSON.stringify({ ...payload, sentAt: new Date().toISOString() })

const headers = { 'Content-Type': 'application/json' }
if (secret) {
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
  headers['X-Signature'] = `sha256=${sig}`
} else {
  console.warn('⚠  Ingen hemlighet satt — skickar OSIGNERAT. Kräver partnern signatur blir svaret 401.\n')
}

const target = new URL(url)
console.log('→ POST     ', target.host + target.pathname)
console.log('→ event    ', payload.event, '· bookingId', bookingId)
console.log('→ signerad ', secret ? `ja (hemlighetens fingeravtryck ${crypto.createHash('sha256').update(secret).digest('hex').slice(0, 12)})` : 'NEJ')
console.log('→ body     ', body)
console.log()

const started = Date.now()
try {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
  })
  const text = await res.text()
  const ms = Date.now() - started

  console.log(`← ${res.status} ${res.statusText}  (${ms} ms)`)
  console.log('← body     ', text || '<tom>')
  console.log()

  if (res.ok) {
    console.log('✅ Partnern kvitterade. Be dem kolla att raden dök upp i deras tabell.')
  } else if (res.status === 401) {
    console.log('❌ 401 — hemligheterna matchar inte, eller så saknades signaturen.')
    console.log('   Jämför fingeravtrycket ovan med partnerns:')
    console.log('   node -e "console.log(require(\'crypto\').createHash(\'sha256\').update(process.env.INTEGRATION_HMAC_SECRET).digest(\'hex\').slice(0,12))"')
  } else if (res.status === 400) {
    console.log('❌ 400 — partnern saknar ett fält i payloaden. Se deras svar ovan.')
  } else if (res.status === 404) {
    console.log('❌ 404 — fel sökväg, eller så pekar URL:en på en adress som inte finns längre.')
  } else {
    console.log(`❌ ${res.status} — se svaret ovan.`)
  }
  process.exit(res.ok ? 0 : 1)
} catch (err) {
  console.log(`← inget svar  (${Date.now() - started} ms)`)
  console.log('← fel      ', err instanceof Error ? err.message : String(err))
  console.log()
  console.log('❌ Kom inte fram alls — kontrollera att URL:en stämmer och att värden svarar.')
  process.exit(1)
}
