import { useCallback, useEffect, useRef, useState } from 'react'
import { shared } from '@ispo/sdk'
import type { BoardItem, BoardState } from '../lib/types'
import { boardPath } from '../lib/shared-paths'

// NOTE: we deliberately do NOT use `useSharedFile` from `@ispo/sdk/react`.
// In this project's bundle the SDK's React helpers live in the externalised
// `react-family` vendor module (a separate React instance from the one that
// renders the app), so their hooks read a null dispatcher and throw "Invalid
// hook call". The core `@ispo/sdk` `shared.*` API carries no React, so we
// drive load/save with this app's own React hooks instead.

function parseBoard(raw: string): BoardItem[] {
  const doc = JSON.parse(raw) as Partial<BoardState>
  return Array.isArray(doc.items) ? (doc.items as BoardItem[]) : []
}

// Owns the persisted board document and every mutation that touches it. State
// lives in this app's React; writes serialise the whole document so the file
// is always a complete, valid BoardState. Mutations read from a ref so several
// can fire in one tick (e.g. a multi-file drop) without stale-closure clobber.
export function useBoard() {
  const [items, setItems] = useState<BoardItem[]>([])
  const itemsRef = useRef<BoardItem[]>(items)
  itemsRef.current = items
  const loadedRef = useRef(false)

  // Load once on mount. A missing file or bad shape is the expected first-run
  // empty state, not an error worth surfacing in the UI.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const raw = await shared.read(boardPath())
        const loaded = parseBoard(raw)
        if (!cancelled) setItems(loaded)
      } catch (err) {
        console.warn('[canvas] board.json not loaded — starting empty:', err)
      } finally {
        loadedRef.current = true
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const persist = useCallback((next: BoardItem[]) => {
    setItems(next)
    const doc: BoardState = { schemaVersion: 1, items: next }
    void shared.write(boardPath(), JSON.stringify(doc)).catch((err) => {
      console.warn('[canvas] board.json write failed:', err)
    })
  }, [])

  // Highest z currently on the board (0 when empty). New cards stack above it.
  const topZ = useCallback(
    () => itemsRef.current.reduce((max, it) => Math.max(max, it.z), 0),
    [],
  )

  const addItems = useCallback(
    (toAdd: BoardItem[]) => {
      if (toAdd.length === 0) return
      persist([...itemsRef.current, ...toAdd])
    },
    [persist],
  )

  const moveItem = useCallback(
    (id: string, x: number, y: number) => {
      persist(itemsRef.current.map((it) => (it.id === id ? { ...it, x, y } : it)))
    },
    [persist],
  )

  const resizeItem = useCallback(
    (id: string, w: number, h: number) => {
      persist(itemsRef.current.map((it) => (it.id === id ? { ...it, w, h } : it)))
    },
    [persist],
  )

  const renameItem = useCallback(
    (id: string, originalName: string) => {
      persist(
        itemsRef.current.map((it) => (it.id === id ? { ...it, originalName } : it)),
      )
    },
    [persist],
  )

  const removeItem = useCallback(
    (id: string) => {
      persist(itemsRef.current.filter((it) => it.id !== id))
    },
    [persist],
  )

  const bringToFront = useCallback(
    (id: string) => {
      const current = itemsRef.current
      const target = current.find((it) => it.id === id)
      const max = current.reduce((m, it) => Math.max(m, it.z), 0)
      // Skip the write if it's already on top — a plain click/grab of the
      // front-most card shouldn't re-persist the board.
      if (!target || target.z === max) return
      persist(current.map((it) => (it.id === id ? { ...it, z: max + 1 } : it)))
    },
    [persist],
  )

  const clearAll = useCallback(() => persist([]), [persist])

  return {
    items,
    addItems,
    moveItem,
    resizeItem,
    renameItem,
    removeItem,
    bringToFront,
    clearAll,
    topZ,
  }
}
