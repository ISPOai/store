// The selector variant of the backport, on top of React's built-in hook.
import { useSyncExternalStore, useMemo, useRef, useEffect } from 'react'

export function useSyncExternalStoreWithSelector(
  subscribe,
  getSnapshot,
  getServerSnapshot,
  selector,
  isEqual,
) {
  const instRef = useRef(null)
  const inst = instRef.current ?? { hasValue: false, value: null }
  if (instRef.current === null) instRef.current = inst

  const [getSelection, getServerSelection] = useMemo(() => {
    let hasMemo = false
    let memoizedSnapshot
    let memoizedSelection
    const memoizedSelector = (nextSnapshot) => {
      if (!hasMemo) {
        hasMemo = true
        memoizedSnapshot = nextSnapshot
        const nextSelection = selector(nextSnapshot)
        if (isEqual !== undefined && inst.hasValue && isEqual(inst.value, nextSelection)) {
          memoizedSelection = inst.value
          return inst.value
        }
        memoizedSelection = nextSelection
        return nextSelection
      }
      if (Object.is(memoizedSnapshot, nextSnapshot)) return memoizedSelection
      const nextSelection = selector(nextSnapshot)
      if (isEqual !== undefined && isEqual(memoizedSelection, nextSelection)) {
        memoizedSnapshot = nextSnapshot
        return memoizedSelection
      }
      memoizedSnapshot = nextSnapshot
      memoizedSelection = nextSelection
      return nextSelection
    }
    const getSnapshotWithSelector = () => memoizedSelector(getSnapshot())
    const getServerSnapshotWithSelector =
      getServerSnapshot === undefined
        ? undefined
        : () => memoizedSelector(getServerSnapshot())
    return [getSnapshotWithSelector, getServerSnapshotWithSelector]
  }, [getSnapshot, getServerSnapshot, selector, isEqual])

  const value = useSyncExternalStore(subscribe, getSelection, getServerSelection)
  useEffect(() => {
    inst.hasValue = true
    inst.value = value
  }, [value])
  return value
}

export default { useSyncExternalStoreWithSelector }
