import type { Block, Deck, DeckPage, DeckTransition, PageLayout } from './types'

// Every deck mutation the editor performs, as pure functions over a deck. They
// return a new deck (or the same one when nothing changed) so the component
// stays a thin controller and the "did anything change" test is a reference
// comparison rather than a deep diff.

export const BLOCK_KINDS: Block['kind'][] = [
  'eyebrow',
  'heading',
  'subheading',
  'body',
  'bullets',
  'quote',
  'code',
  'metric',
]

export const PAGE_LAYOUTS: PageLayout[] = ['title', 'content', 'section', 'statement']

/** A new block of `kind`, with placeholder copy so it is visible on the canvas. */
export function emptyBlock(kind: Block['kind']): Block {
  switch (kind) {
    case 'bullets':
      return { kind, items: ['New point'] }
    case 'quote':
      return { kind, text: 'A quotation' }
    case 'metric':
      return { kind, value: '100%' }
    default:
      return { kind, text: kind === 'heading' ? 'New heading' : 'New text' }
  }
}

export function emptyPage(layout: PageLayout = 'content'): DeckPage {
  return { layout, blocks: [emptyBlock(layout === 'title' ? 'heading' : 'body')] }
}

function withPages(deck: Deck, pages: DeckPage[]): Deck {
  return { ...deck, pages, updatedAt: new Date().toISOString() }
}

function mapPage(deck: Deck, index: number, fn: (page: DeckPage) => DeckPage): Deck {
  const page = deck.pages[index]
  if (!page) return deck
  const pages = [...deck.pages]
  pages[index] = fn(page)
  return withPages(deck, pages)
}

export function setDeckTitle(deck: Deck, title: string): Deck {
  return { ...deck, title, updatedAt: new Date().toISOString() }
}

export function setDeckDesign(deck: Deck, design: Deck['design']): Deck {
  return { ...deck, design, updatedAt: new Date().toISOString() }
}

export function setDeckTransition(deck: Deck, transition: DeckTransition): Deck {
  return { ...deck, transition, updatedAt: new Date().toISOString() }
}

/** Step 0 means "on the page from the start", so it is stored as no step. */
export function setBlockStep(
  deck: Deck,
  pageIndex: number,
  blockIndex: number,
  step: number,
): Deck {
  const block = deck.pages[pageIndex]?.blocks[blockIndex]
  if (!block) return deck
  const { step: _dropped, ...rest } = block
  const next = (step > 0 ? { ...rest, step } : rest) as Block
  return updateBlock(deck, pageIndex, blockIndex, next)
}

export function setPageLayout(deck: Deck, index: number, layout: PageLayout): Deck {
  return mapPage(deck, index, (page) => ({ ...page, layout }))
}

export function setPageNotes(deck: Deck, index: number, notes: string): Deck {
  return mapPage(deck, index, (page) => {
    if (notes.length === 0) {
      // Drop the key entirely rather than storing an empty string, so a page
      // without notes round-trips to the same document it started as.
      const { notes: _dropped, ...rest } = page
      return rest
    }
    return { ...page, notes }
  })
}

export function addPage(deck: Deck, afterIndex: number): Deck {
  const pages = [...deck.pages]
  pages.splice(afterIndex + 1, 0, emptyPage())
  return withPages(deck, pages)
}

/** Removing the last page is refused — a deck with no pages cannot render. */
export function removePage(deck: Deck, index: number): Deck {
  if (deck.pages.length <= 1) return deck
  const pages = deck.pages.filter((_, i) => i !== index)
  return withPages(deck, pages)
}

export function movePage(deck: Deck, index: number, delta: number): Deck {
  const next = index + delta
  if (next < 0 || next >= deck.pages.length) return deck
  const pages = [...deck.pages]
  const [moved] = pages.splice(index, 1)
  if (!moved) return deck
  pages.splice(next, 0, moved)
  return withPages(deck, pages)
}

export function updateBlock(
  deck: Deck,
  pageIndex: number,
  blockIndex: number,
  block: Block,
): Deck {
  return mapPage(deck, pageIndex, (page) => {
    const blocks = [...page.blocks]
    blocks[blockIndex] = block
    return { ...page, blocks }
  })
}

export function addBlock(deck: Deck, pageIndex: number, kind: Block['kind']): Deck {
  return mapPage(deck, pageIndex, (page) => ({
    ...page,
    blocks: [...page.blocks, emptyBlock(kind)],
  }))
}

/** A page keeps at least one block, for the same reason a deck keeps one page. */
export function removeBlock(deck: Deck, pageIndex: number, blockIndex: number): Deck {
  return mapPage(deck, pageIndex, (page) =>
    page.blocks.length <= 1
      ? page
      : { ...page, blocks: page.blocks.filter((_, i) => i !== blockIndex) },
  )
}

export function moveBlock(deck: Deck, pageIndex: number, blockIndex: number, delta: number): Deck {
  return mapPage(deck, pageIndex, (page) => {
    const next = blockIndex + delta
    if (next < 0 || next >= page.blocks.length) return page
    const blocks = [...page.blocks]
    const [moved] = blocks.splice(blockIndex, 1)
    if (!moved) return page
    blocks.splice(next, 0, moved)
    return { ...page, blocks }
  })
}
