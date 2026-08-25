import { fs } from '@ispo/sdk'
import { isDeck, type Deck } from './types'

// Every deck is one JSON document under the project's own data root, so a deck
// is readable in Finder and survives independently of anything this app holds
// in memory. One file per deck keeps a write to one deck from rewriting the
// rest — the whole library is never serialised at once.

const DECKS_DIR = 'decks'
const JSON_SUFFIX = '.json'

export function deckPath(id: string): string {
  return `${DECKS_DIR}/${id}${JSON_SUFFIX}`
}

// The SDK throws on a missing path; an empty library is the ordinary first run,
// not a failure, so both listing and reading translate that into "nothing yet".
function isMissing(err: unknown): boolean {
  const message =
    typeof err === 'string' ? err : ((err as { message?: unknown })?.message ?? '')
  return (
    typeof message === 'string' &&
    (message.includes('project file not found:') ||
      message.includes('project directory not found:'))
  )
}

export async function listDeckIds(): Promise<string[]> {
  try {
    const entries = await fs.list(DECKS_DIR)
    return entries
      .filter((name) => name.endsWith(JSON_SUFFIX) && !name.endsWith('/'))
      .map((name) => name.slice(0, -JSON_SUFFIX.length))
  } catch (err) {
    if (isMissing(err)) return []
    throw err
  }
}

export async function readDeck(id: string): Promise<Deck | null> {
  let raw: string
  try {
    raw = await fs.read(deckPath(id))
  } catch (err) {
    if (isMissing(err)) return null
    throw err
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    return isDeck(parsed) ? parsed : null
  } catch {
    // A hand-edited deck that no longer parses is skipped rather than fatal:
    // the rest of the library still opens.
    return null
  }
}

export async function writeDeck(deck: Deck): Promise<void> {
  await fs.write(deckPath(deck.id), `${JSON.stringify(deck, null, 2)}\n`)
}

export async function deleteDeck(id: string): Promise<void> {
  await fs.delete(deckPath(id))
}

/** Newest first — the order the deck list and the command both present. */
export async function listDecks(): Promise<Deck[]> {
  const ids = await listDeckIds()
  const decks: Deck[] = []
  for (const id of ids) {
    const deck = await readDeck(id)
    if (deck) decks.push(deck)
  }
  return decks.sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1))
}

/**
 * Derive a free deck id from a title. The suffix loop is what keeps two decks
 * called "Q3 Review" from resolving to the same file and silently overwriting
 * each other.
 */
export async function allocateDeckId(title: string, taken: readonly string[]): Promise<string> {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'deck'
  const used = new Set(taken.length > 0 ? taken : await listDeckIds())
  if (!used.has(base)) return base
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`
    if (!used.has(candidate)) return candidate
  }
  throw new Error(`could not allocate a deck id for "${title}"`)
}
