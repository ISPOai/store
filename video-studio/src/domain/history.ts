// Snapshot undo/redo over immutable composition documents. Each committed
// mutation batch pushes the resulting document; undo/redo restore the exact
// stored value, so no inverse computation exists to get wrong. The stack is
// bounded and drops the oldest state beyond the limit.

export interface HistoryState<T> {
  readonly present: T
  readonly canUndo: boolean
  readonly canRedo: boolean
}

const DEFAULT_LIMIT = 100

export class DocumentHistory<T> {
  private past: T[] = []
  private future: T[] = []
  private presentValue: T

  private readonly limit: number

  public constructor(initial: T, limit: number = DEFAULT_LIMIT) {
    this.presentValue = initial
    this.limit = limit
  }

  public get present(): T {
    return this.presentValue
  }

  public state(): HistoryState<T> {
    return {
      present: this.presentValue,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
    }
  }

  /** Records `next` as the new present state. Clears the redo stack. */
  public commit(next: T): HistoryState<T> {
    if (next === this.presentValue) return this.state()
    this.past.push(this.presentValue)
    if (this.past.length > this.limit) this.past.shift()
    this.future = []
    this.presentValue = next
    return this.state()
  }

  public undo(): HistoryState<T> {
    const previous = this.past.pop()
    if (previous === undefined) return this.state()
    this.future.push(this.presentValue)
    this.presentValue = previous
    return this.state()
  }

  public redo(): HistoryState<T> {
    const next = this.future.pop()
    if (next === undefined) return this.state()
    this.past.push(this.presentValue)
    this.presentValue = next
    return this.state()
  }

  /** Replaces the present state without recording an undo step (a reset,
   * such as restoring an autosaved document after a remount). */
  public reset(present: T): HistoryState<T> {
    this.past = []
    this.future = []
    this.presentValue = present
    return this.state()
  }
}
