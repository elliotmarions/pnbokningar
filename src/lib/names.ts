/**
 * Format a person's name for display as "Förnamn Efternamn".
 *
 * Azure / Microsoft 365 appends a ", Company" suffix to the display name
 * (e.g. "Elliot Marions, PostNord"). We never want that in the UI, so strip
 * everything from the first comma onwards.
 */
export function displayName(name?: string | null): string {
  if (!name) return ''
  return name.split(',')[0].trim()
}
