// One-time script: generate a VAPID keypair for Web Push.
// Run: node scripts/gen-vapid.mjs
//
// Copy the output into .env.local (for local dev) and into Vercel project
// settings (Environment Variables) for production. Never share the private key.

import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()
console.log('\n--- VAPID keypair ---\n')
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey)
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey)
console.log('VAPID_SUBJECT=mailto:elliot.marions@postnord.com')
console.log('\nAdd these three to .env.local AND to Vercel → Settings → Environment Variables.')
console.log('After adding them to Vercel, redeploy for the change to take effect.\n')
