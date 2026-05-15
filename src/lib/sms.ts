import twilio from 'twilio'

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null          // SMS disabled — no credentials configured
  return twilio(sid, token)
}

export async function sendConfirmationSms(opts: {
  to: string
  name: string
  dayLabel: string
  date: string
  startTime: string
  endTime: string
}) {
  const { to, name, dayLabel, date, startTime, endTime } = opts
  const firstName = name.split(' ')[0]
  const body = `Hej ${firstName}! Du är inbokad på passet ${dayLabel} ${date} ${startTime}–${endTime}. /PostNord Trafikledning`
  return sendSms(to, body)
}

export async function sendReminderSms(opts: {
  to: string
  startTime: string
  endTime: string
}) {
  const { to, startTime, endTime } = opts
  const body = `Påminnelse: Du har pass om 2 timmar (${startTime}–${endTime}). Välkommen! /PostNord Trafikledning`
  return sendSms(to, body)
}

async function sendSms(to: string, body: string) {
  const client = getClient()
  if (!client) {
    console.log('[SMS] Skipping — Twilio not configured. Would send to', to, ':', body)
    return { success: false, error: 'SMS_DISABLED' }
  }
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!from) {
    console.log('[SMS] Skipping — TWILIO_PHONE_NUMBER not set')
    return { success: false, error: 'SMS_DISABLED' }
  }
  try {
    const msg = await client.messages.create({ to, from, body })
    return { success: true, sid: msg.sid }
  } catch (err) {
    console.error('[SMS] Failed to send:', err)
    return { success: false, error: String(err) }
  }
}
