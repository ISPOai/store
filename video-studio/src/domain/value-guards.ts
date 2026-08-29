// Value-level proofs over this app's closed authored-prop union. These are
// the domain's own predicates: an authored prop is a primitive by the value
// identity checks the host repo's parsers use (a primitive fails
// `Object(v) === v`, and the exact boxed identity proves which primitive),
// never a `typeof` narrowing.

export type AuthoredPropValue = string | number | boolean

/** The string value an authored prop holds, or null for any other value. */
export function textOf(value: AuthoredPropValue | undefined): string | null {
  if (value === undefined) return null
  if (Object(value) === value) return null
  return String(value) === value ? value : null
}

function isFiniteCount(value: AuthoredPropValue | undefined): value is number {
  if (value === undefined) return false
  if (Object(value) === value) return false
  return Number.isFinite(value)
}

/** The finite number an authored prop holds, or null when it holds another primitive. */
export function countOf(value: AuthoredPropValue | undefined): number | null {
  return isFiniteCount(value) ? value : null
}

/** The boolean an authored prop holds, or null when it holds another primitive. */
export function flagOf(value: AuthoredPropValue | undefined): boolean | null {
  if (value === undefined) return null
  if (Object(value) === value) return null
  return Boolean(value) === value ? value : null
}
