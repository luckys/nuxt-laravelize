export function selectPluralForm(template: string, count: number): string {
  const segments = template.split('|').map((s) => s.trim())
  if (segments.length === 1) return template
  if (segments.length === 2) return count === 1 ? segments[0]! : segments[1]!
  return count === 0 ? segments[0]! : count === 1 ? segments[1]! : segments[2]!
}
