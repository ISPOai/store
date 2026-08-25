import type { Block, Deck } from '../lib/types'
import {
  BLOCK_KINDS,
  PAGE_LAYOUTS,
  addBlock,
  addPage,
  moveBlock,
  movePage,
  removeBlock,
  removePage,
  setBlockStep,
  setDeckDesign,
  setDeckTitle,
  setDeckTransition,
  setPageLayout,
  setPageNotes,
  updateBlock,
} from '../lib/deck-edit'

// Edits the page currently on the canvas. Every control produces a whole new
// deck through the pure helpers and hands it up; this panel holds no state of
// its own, so what you see on the canvas is always what is about to be saved.

type Props = {
  deck: Deck
  pageIndex: number
  onChange: (deck: Deck) => void
  onPageIndexChange: (index: number) => void
  onClose: () => void
  saving: boolean
}

function BlockFields({
  block,
  onChange,
}: {
  block: Block
  onChange: (block: Block) => void
}) {
  if (block.kind === 'bullets') {
    return (
      <textarea
        className="osd-field osd-field-area"
        // One bullet per line is the fastest thing to type and to paste into;
        // the array shape stays an implementation detail of the document.
        value={block.items.join('\n')}
        rows={Math.min(8, Math.max(2, block.items.length))}
        onChange={(e) =>
          onChange({
            kind: 'bullets',
            items: e.target.value.split('\n').map((line) => line.trim()),
          })
        }
        placeholder="One bullet per line"
      />
    )
  }

  if (block.kind === 'metric') {
    return (
      <div className="osd-field-row">
        <input
          className="osd-field"
          value={block.value}
          onChange={(e) => onChange({ ...block, value: e.target.value })}
          placeholder="42%"
        />
        <input
          className="osd-field"
          value={block.caption ?? ''}
          onChange={(e) => onChange({ ...block, caption: e.target.value })}
          placeholder="Caption"
        />
      </div>
    )
  }

  if (block.kind === 'quote') {
    return (
      <div className="osd-field-row">
        <textarea
          className="osd-field osd-field-area"
          rows={3}
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder="Quotation"
        />
        <input
          className="osd-field"
          value={block.attribution ?? ''}
          onChange={(e) => onChange({ ...block, attribution: e.target.value })}
          placeholder="Attribution"
        />
      </div>
    )
  }

  const multiline = block.kind === 'body' || block.kind === 'code'
  return multiline ? (
    <textarea
      className="osd-field osd-field-area"
      rows={block.kind === 'code' ? 5 : 3}
      value={block.text}
      onChange={(e) => onChange({ ...block, text: e.target.value })}
    />
  ) : (
    <input
      className="osd-field"
      value={block.text}
      onChange={(e) => onChange({ ...block, text: e.target.value })}
    />
  )
}

export function EditorPanel({
  deck,
  pageIndex,
  onChange,
  onPageIndexChange,
  onClose,
  saving,
}: Props) {
  const page = deck.pages[pageIndex]
  if (!page) return null

  return (
    <aside className="osd-editor">
      <header className="osd-editor-header">
        <span className="osd-editor-title">Edit</span>
        <span className="osd-save-state">{saving ? 'Saving…' : 'Saved'}</span>
        <button type="button" className="osd-icon-button" onClick={onClose} aria-label="Close editor">
          ✕
        </button>
      </header>

      <div className="osd-editor-body">
        <section className="osd-editor-section">
          <label className="osd-label" htmlFor="osd-deck-title">
            Deck title
          </label>
          <input
            id="osd-deck-title"
            className="osd-field"
            value={deck.title}
            onChange={(e) => onChange(setDeckTitle(deck, e.target.value))}
          />
          <label className="osd-label" htmlFor="osd-deck-design">
            Design
          </label>
          <select
            id="osd-deck-design"
            className="osd-field"
            value={deck.design}
            onChange={(e) => onChange(setDeckDesign(deck, e.target.value as Deck['design']))}
          >
            <option value="default">Default — warm serif</option>
            <option value="midnight">Midnight — dark mono</option>
          </select>
          <label className="osd-label" htmlFor="osd-deck-transition">
            Transition
          </label>
          <select
            id="osd-deck-transition"
            className="osd-field"
            value={deck.transition ?? 'fade'}
            onChange={(e) =>
              onChange(setDeckTransition(deck, e.target.value as NonNullable<Deck['transition']>))
            }
          >
            <option value="none">None</option>
            <option value="fade">Fade</option>
            <option value="slide">Slide</option>
          </select>
        </section>

        <section className="osd-editor-section">
          <div className="osd-editor-section-head">
            <span className="osd-label">
              Page {pageIndex + 1} of {deck.pages.length}
            </span>
            <div className="osd-inline-actions">
              <button
                type="button"
                className="osd-icon-button"
                onClick={() => {
                  onChange(movePage(deck, pageIndex, -1))
                  onPageIndexChange(Math.max(0, pageIndex - 1))
                }}
                disabled={pageIndex === 0}
                aria-label="Move page earlier"
              >
                ↑
              </button>
              <button
                type="button"
                className="osd-icon-button"
                onClick={() => {
                  onChange(movePage(deck, pageIndex, 1))
                  onPageIndexChange(Math.min(deck.pages.length - 1, pageIndex + 1))
                }}
                disabled={pageIndex >= deck.pages.length - 1}
                aria-label="Move page later"
              >
                ↓
              </button>
              <button
                type="button"
                className="osd-icon-button"
                onClick={() => {
                  onChange(addPage(deck, pageIndex))
                  onPageIndexChange(pageIndex + 1)
                }}
                aria-label="Add page after this one"
              >
                +
              </button>
              <button
                type="button"
                className="osd-icon-button osd-icon-danger"
                onClick={() => {
                  onChange(removePage(deck, pageIndex))
                  onPageIndexChange(Math.max(0, pageIndex - 1))
                }}
                disabled={deck.pages.length <= 1}
                aria-label="Delete this page"
              >
                ✕
              </button>
            </div>
          </div>
          <label className="osd-label" htmlFor="osd-page-layout">
            Layout
          </label>
          <select
            id="osd-page-layout"
            className="osd-field"
            value={page.layout}
            onChange={(e) =>
              onChange(setPageLayout(deck, pageIndex, e.target.value as (typeof PAGE_LAYOUTS)[number]))
            }
          >
            {PAGE_LAYOUTS.map((layout) => (
              <option key={layout} value={layout}>
                {layout}
              </option>
            ))}
          </select>
        </section>

        <section className="osd-editor-section">
          <span className="osd-label">Blocks</span>
          {page.blocks.map((block, i) => (
            <div className="osd-block-card" key={`${block.kind}-${i}`}>
              <div className="osd-block-head">
                <span className="osd-block-kind">{block.kind}</span>
                <div className="osd-inline-actions">
                  <button
                    type="button"
                    className="osd-icon-button"
                    onClick={() => onChange(moveBlock(deck, pageIndex, i, -1))}
                    disabled={i === 0}
                    aria-label="Move block up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="osd-icon-button"
                    onClick={() => onChange(moveBlock(deck, pageIndex, i, 1))}
                    disabled={i >= page.blocks.length - 1}
                    aria-label="Move block down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="osd-icon-button osd-icon-danger"
                    onClick={() => onChange(removeBlock(deck, pageIndex, i))}
                    disabled={page.blocks.length <= 1}
                    aria-label="Delete block"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <BlockFields
                block={block}
                onChange={(next) => onChange(updateBlock(deck, pageIndex, i, next))}
              />
              <label className="osd-step-field">
                <span>Reveal at step</span>
                <input
                  className="osd-field osd-field-step"
                  type="number"
                  min={0}
                  max={20}
                  value={block.step ?? 0}
                  onChange={(e) =>
                    onChange(setBlockStep(deck, pageIndex, i, Number(e.target.value) || 0))
                  }
                />
              </label>
            </div>
          ))}
          <div className="osd-add-block">
            <label className="osd-label" htmlFor="osd-add-block">
              Add block
            </label>
            <select
              id="osd-add-block"
              className="osd-field"
              value=""
              onChange={(e) => {
                if (!e.target.value) return
                onChange(addBlock(deck, pageIndex, e.target.value as Block['kind']))
                // Reset to the placeholder so picking the same kind twice in a
                // row still fires a change event.
                e.target.value = ''
              }}
            >
              <option value="">Choose a kind…</option>
              {BLOCK_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="osd-editor-section">
          <label className="osd-label" htmlFor="osd-page-notes">
            Speaker notes
          </label>
          <textarea
            id="osd-page-notes"
            className="osd-field osd-field-area"
            rows={3}
            value={page.notes ?? ''}
            onChange={(e) => onChange(setPageNotes(deck, pageIndex, e.target.value))}
            placeholder="Only you see these."
          />
        </section>
      </div>
    </aside>
  )
}
