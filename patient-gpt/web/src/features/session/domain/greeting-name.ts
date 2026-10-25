// TJ-ARCH-MOB-001 compliant
// "Dr. K. James" → "Dr. James": the greeting keeps the title and surname and
// drops initials, matching the prototype's "Which case first, Dr. James?".
export function greetingName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/)
  if (parts.length < 2) return displayName.trim()
  const title = /^(Dr|Mr|Mrs|Ms|Mx)\.?$/i.test(parts[0] ?? '') ? parts[0] : null
  const surname = parts[parts.length - 1] ?? ''
  return title ? `${title} ${surname}` : surname
}

export function initials(displayName: string): string {
  return displayName
    .replace(/^(Dr|Mr|Mrs|Ms|Mx)\.?\s+/i, '')
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Za-z]/g, '').charAt(0))
    .filter(Boolean)
    .join('')
    .toUpperCase()
}

const ROLE_LABEL = { surgeon: 'Surgeon', coordinator: 'Coordinator', administrator: 'Administrator' } as const
export function roleLabel(role: keyof typeof ROLE_LABEL): string {
  return ROLE_LABEL[role]
}
