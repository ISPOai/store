import type { Deck } from './types'

// Seeded once into an empty library so the app opens onto a real deck instead
// of an empty state, and so every layout and block kind has a live example to
// copy. Its content is the app's own premise, which keeps it honest: if the
// renderer regresses, the deck explaining the renderer is the first thing broken.

export function exampleDeck(now: string): Deck {
  return {
    schemaVersion: 1,
    id: 'welcome-to-open-slide',
    title: 'Welcome to Open Slide',
    design: 'default',
    transition: 'fade',
    createdAt: now,
    updatedAt: now,
    pages: [
      {
        layout: 'title',
        blocks: [
          { kind: 'eyebrow', text: 'Open Slide' },
          { kind: 'heading', text: 'Slides that live in your workspace.' },
          {
            kind: 'subheading',
            text: 'A fixed 1920 × 1080 canvas, scaled to whatever space it is given.',
          },
        ],
        notes: 'Opening frame. The subheading is the one idea the whole app rests on.',
      },
      {
        layout: 'section',
        blocks: [
          { kind: 'eyebrow', text: 'How it works' },
          { kind: 'heading', text: 'One canvas, any size' },
        ],
      },
      {
        layout: 'content',
        blocks: [
          { kind: 'heading', text: 'Author once, fits everywhere' },
          {
            kind: 'body',
            text: 'Every page is laid out against the same stage, so sizes are absolute pixels rather than guesses.',
          },
          {
            kind: 'bullets',
            step: 1,
            items: [
              'Type sizes stay put — a heading is the same heading in a thumbnail and full screen',
              'The overview grid renders the real page, not a separate preview',
              'Arrows, space, and Page Down advance; Home and End jump to the ends',
              'Press O for the overview, Esc to leave present mode',
            ],
          },
          {
            kind: 'body',
            step: 2,
            text: 'This line waited for a second keypress — blocks can be staged so a page arrives a piece at a time.',
          },
        ],
        notes: 'Walk the bullets, then press forward once more to stage the closing line.',
      },
      {
        layout: 'content',
        blocks: [
          { kind: 'heading', text: 'Decks an agent can write' },
          {
            kind: 'body',
            text: 'A deck is data on disk, so the project command below creates one without anyone opening the editor.',
          },
          {
            kind: 'code',
            text: 'create-deck({\n  title: "Q3 review",\n  pages: [{ layout: "title", blocks: [...] }]\n})',
          },
        ],
      },
      {
        layout: 'statement',
        blocks: [
          { kind: 'metric', value: '1920 × 1080', caption: 'Every page, every time' },
        ],
      },
      {
        layout: 'statement',
        blocks: [
          {
            kind: 'quote',
            text: 'Slides are visual code. Agents are great at writing code.',
            attribution: 'open-slide',
          },
        ],
        notes: 'Close on the upstream framing; hand back to questions here.',
      },
    ],
  }
}
