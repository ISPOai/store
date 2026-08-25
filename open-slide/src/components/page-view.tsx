import type { CSSProperties } from 'react'
import type { Block, DeckPage } from '../lib/types'

// The layouts a data deck can use. Upstream renders arbitrary React per page;
// here the page picks one of four arrangements and fills it with blocks. Every
// value is an absolute pixel size against the 1920×1080 stage — the canvas
// scales the result, so nothing here needs to be responsive.

const PAD = 140

const layoutFrame: Record<DeckPage['layout'], CSSProperties> = {
  title: { justifyContent: 'center', alignItems: 'flex-start', gap: 40 },
  content: { justifyContent: 'flex-start', alignItems: 'flex-start', gap: 36, paddingTop: 160 },
  section: { justifyContent: 'center', alignItems: 'flex-start', gap: 28 },
  statement: { justifyContent: 'center', alignItems: 'center', gap: 32, textAlign: 'center' },
}

function BlockView({ block, layout }: { block: Block; layout: DeckPage['layout'] }) {
  switch (block.kind) {
    case 'eyebrow':
      return (
        <div
          style={{
            fontFamily: 'var(--osd-font-display)',
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--osd-accent)',
          }}
        >
          {block.text}
        </div>
      )
    case 'heading':
      return (
        <div
          style={{
            fontFamily: 'var(--osd-font-display)',
            // A title page gets the hero size; a content page's heading has to
            // leave room for the content under it.
            fontSize: layout === 'title' ? 'var(--osd-size-hero)' : 84,
            lineHeight: 1.02,
            letterSpacing: '-0.02em',
            maxWidth: 1500,
          }}
        >
          {block.text}
        </div>
      )
    case 'subheading':
      return (
        <div style={{ fontSize: 46, opacity: 0.72, maxWidth: 1400, lineHeight: 1.3 }}>
          {block.text}
        </div>
      )
    case 'body':
      return (
        <div
          style={{
            fontSize: 'var(--osd-size-body)',
            lineHeight: 1.5,
            maxWidth: 1350,
            opacity: 0.88,
          }}
        >
          {block.text}
        </div>
      )
    case 'bullets':
      return (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 26,
            maxWidth: 1400,
          }}
        >
          {block.items.map((item, i) => (
            <li
              key={`${i}-${item.slice(0, 24)}`}
              style={{
                display: 'flex',
                gap: 26,
                alignItems: 'baseline',
                fontSize: 'var(--osd-size-body)',
                lineHeight: 1.4,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flex: 'none',
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background: 'var(--osd-accent)',
                  transform: 'translateY(-4px)',
                }}
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )
    case 'quote':
      return (
        <div style={{ maxWidth: 1500 }}>
          <div
            style={{
              fontFamily: 'var(--osd-font-display)',
              fontSize: 68,
              lineHeight: 1.22,
              letterSpacing: '-0.01em',
            }}
          >
            “{block.text}”
          </div>
          {block.attribution ? (
            <div style={{ marginTop: 32, fontSize: 32, opacity: 0.6 }}>— {block.attribution}</div>
          ) : null}
        </div>
      )
    case 'code':
      return (
        <pre
          style={{
            margin: 0,
            padding: '32px 40px',
            borderRadius: 'var(--osd-radius)',
            background: 'color-mix(in srgb, var(--osd-text) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--osd-text) 14%, transparent)',
            fontFamily: "'JetBrains Mono', Menlo, Consolas, monospace",
            fontSize: 30,
            lineHeight: 1.5,
            maxWidth: 1500,
            overflow: 'hidden',
            whiteSpace: 'pre-wrap',
          }}
        >
          {block.text}
        </pre>
      )
    case 'metric':
      return (
        <div>
          <div
            style={{
              fontFamily: 'var(--osd-font-display)',
              fontSize: 200,
              lineHeight: 1,
              color: 'var(--osd-accent)',
              letterSpacing: '-0.03em',
            }}
          >
            {block.value}
          </div>
          {block.caption ? (
            <div style={{ marginTop: 24, fontSize: 38, opacity: 0.72 }}>{block.caption}</div>
          ) : null}
        </div>
      )
  }
}

export function PageView({ page, revealed = Number.POSITIVE_INFINITY }: {
  page: DeckPage
  /** Highest step currently on screen. Defaults to "everything" for thumbnails. */
  revealed?: number
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: PAD,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--osd-font-body)',
        color: 'var(--osd-text)',
        background: 'var(--osd-bg)',
        overflow: 'hidden',
        ...layoutFrame[page.layout],
      }}
    >
      {page.layout === 'section' ? (
        <div
          aria-hidden="true"
          style={{ width: 180, height: 10, background: 'var(--osd-accent)', marginBottom: 20 }}
        />
      ) : null}
      {page.blocks.map((block, i) => {
        const step = block.step ?? 0
        const shown = step <= revealed
        return (
          // A pending block keeps its box so revealing it does not reflow the
          // page — the layout is settled from the first frame, only opacity moves.
          <div
            key={`${block.kind}-${i}`}
            style={{
              opacity: shown ? 1 : 0,
              transform: shown ? 'none' : 'translateY(14px)',
              transition: 'opacity 320ms ease-out, transform 320ms ease-out',
            }}
            aria-hidden={shown ? undefined : true}
          >
            <BlockView block={block} layout={page.layout} />
          </div>
        )
      })}
    </div>
  )
}
