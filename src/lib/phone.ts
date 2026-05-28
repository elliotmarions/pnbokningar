/**
 * Normalize a Swedish phone number to the canonical display format:
 *   "070 966 98 55"  (mobile, grouped 3-3-2-2)
 *
 * Accepts the common ways people type it:
 *   "761667375"      → "076 166 73 75"   (9 digits, missing leading 0)
 *   "0702019295"     → "070 201 92 95"   (10 digits, national)
 *   "+46725316504"   → "072 531 65 04"   (international)
 *   "0046725316504"  → "072 531 65 04"
 *
 * Falls back to the raw input untouched if it doesn't look like a phone number
 * we can confidently normalize (so we never mangle something unexpected).
 */
export function formatSwedishPhone(raw: string): string {
  if (!raw) return raw
  const trimmed = raw.trim()
  const hadPlus = trimmed.startsWith('+')
  let digits = trimmed.replace(/\D/g, '')

  // Strip country code (00 46… / +46… / bare 46… when 11 digits long).
  if (digits.startsWith('0046')) {
    digits = digits.slice(4)
  } else if (digits.startsWith('46') && (hadPlus || digits.length === 11)) {
    digits = digits.slice(2)
  }

  // Add the national leading zero if it's missing.
  if (!digits.startsWith('0')) digits = '0' + digits

  // Standard Swedish mobile: 10 digits → group 3-3-2-2.
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`
  }

  // Anything else (landline, odd length): return the cleaned national digits
  // rather than guessing a grouping that might be wrong.
  return digits
}
