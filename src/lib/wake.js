// Pure helpers behind the wake/sleep tools.

const norm = (n) => String(n ?? '').trim().toLowerCase()

// Matches requested names against the registered ones, ignoring case and
// spacing. Returns the registered spellings, plus the names that matched nobody.
export function resolveNames(requested, registered) {
  const byKey = new Map(registered.map((n) => [norm(n), n]))
  const resolved = []
  const unknown = []
  for (const r of requested || []) {
    const hit = byKey.get(norm(r))
    if (hit) {
      if (!resolved.includes(hit)) resolved.push(hit)
    } else if (norm(r)) unknown.push(String(r))
  }
  return { resolved, unknown }
}

// policy: null (anyone may wake it) or { users: string[], anyRegistered: boolean }.
// `who` is the recognised name of the person on camera ('' for a stranger).
export function mayWake(policy, who) {
  if (!policy) return true
  if (!who) return false
  return policy.anyRegistered || policy.users.some((u) => norm(u) === norm(who))
}

export function describePolicy(policy) {
  if (!policy) return 'anyone who shows their face wakes me'
  const names = policy.users.join(', ')
  if (policy.anyRegistered && names) return `only registered users wake me (${names} included)`
  if (policy.anyRegistered) return 'only registered users wake me, not strangers'
  return `only ${names} can wake me`
}

const COLOR_NAMES = {
  red: '#e53935', orange: '#fb8c00', yellow: '#fdd835', green: '#43a047', teal: '#26a69a', cyan: '#00bcd4',
  blue: '#1e63e9', purple: '#8e44ad', violet: '#7e57c2', pink: '#ec407a', magenta: '#d81b60', brown: '#8d6e63',
  white: '#f5f5f5', black: '#1a1a1a', gray: '#9e9e9e', grey: '#9e9e9e', gold: '#f1c40f', silver: '#c0c0c0',
}

// '#rgb', '#rrggbb' or a colour name -> '#rrggbb', or null if it isn't one.
export function parseColor(input) {
  const s = norm(input)
  if (COLOR_NAMES[s]) return COLOR_NAMES[s]
  const m = s.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/)
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  return `#${h}`
}
