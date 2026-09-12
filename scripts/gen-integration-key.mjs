// Generate an API key for a partner integration (and, optionally, the outbound
// webhook secret).
//
// Run:  npm run gen-integration-key -- <etikett>
// Ex:   npm run gen-integration-key -- akeri
//
// Nyckeln skrivs BARA ut här — den sparas ingenstans. Lägg den i Vercel →
// Settings → Environment Variables och skicka den till partnern via en säker
// kanal (lösenordshanterare, inte mejl/chatt/Git).

import crypto from 'crypto'

const label = (process.argv[2] ?? 'partner').trim().toLowerCase()
if (!/^[a-z0-9-]{1,32}$/.test(label)) {
  console.error('Etiketten får bara innehålla a-z, 0-9 och bindestreck (max 32 tecken).')
  console.error('Exempel: npm run gen-integration-key -- akeri')
  process.exit(1)
}

// 32 bytes = 256 bitar entropi. base64url → inga kommatecken/kolon som krockar
// med formatet "etikett:nyckel,etikett2:nyckel2".
const key = 'pnb_' + crypto.randomBytes(32).toString('base64url')
const webhookSecret = crypto.randomBytes(32).toString('base64url')

console.log(`
--- Partnernyckel för "${label}" ---

Lägg till i INTEGRATION_API_KEY (kommaseparerad lista om flera partners):

  ${label}:${key}

Skicka till partnern (bara nyckeln, inte etiketten):

  ${key}

Utgående webhooks (om partnern ska ta emot booking.confirmed/.cancelled) —
sätt INTEGRATION_WEBHOOK_URL till partnerns endpoint och dela detta secret:

  INTEGRATION_WEBHOOK_SECRET=${webhookSecret}

Nästa steg:
  1. Vercel → Settings → Environment Variables → uppdatera INTEGRATION_API_KEY.
  2. Redeploya (nya env-värden slår igenom först vid ny deploy).
  3. Ge partnern INTEGRATION.md + nyckeln via lösenordshanterare.

Rotation: lägg till den nya nyckeln bredvid den gamla (t.ex. "${label}-2:..."),
låt partnern byta, ta sedan bort den gamla raden.
`)
