import test from 'node:test'
import assert from 'node:assert/strict'
import { DocumentHistory } from './history.ts'

test('commit records undoable steps and clears redo', () => {
  const history = new DocumentHistory<number>(1)
  history.commit(2)
  history.commit(3)
  assert.equal(history.state().canUndo, true)
  history.undo()
  assert.equal(history.present, 2)
  assert.equal(history.state().canRedo, true)
  history.commit(4)
  assert.equal(history.state().canRedo, false)
  assert.equal(history.present, 4)
})

test('undo and redo restore exact values in order', () => {
  const history = new DocumentHistory<string>('a')
  history.commit('b')
  history.commit('c')
  assert.equal(history.undo().present, 'b')
  assert.equal(history.undo().present, 'a')
  assert.equal(history.state().canUndo, false)
  assert.equal(history.redo().present, 'b')
  assert.equal(history.redo().present, 'c')
  assert.equal(history.state().canRedo, false)
})

test('undo past the beginning is a no-op', () => {
  const history = new DocumentHistory<number>(7)
  assert.equal(history.undo().present, 7)
  assert.equal(history.state().canUndo, false)
})

test('identical commits collapse', () => {
  const history = new DocumentHistory<number>(1)
  history.commit(1)
  assert.equal(history.state().canUndo, false)
})

test('the stack drops the oldest beyond the limit', () => {
  const history = new DocumentHistory<number>(0, 3)
  history.commit(1)
  history.commit(2)
  history.commit(3)
  history.commit(4)
  assert.equal(history.undo().present, 3)
  assert.equal(history.undo().present, 2)
  assert.equal(history.undo().present, 1)
  assert.equal(history.state().canUndo, false)
})

test('reset clears both stacks', () => {
  const history = new DocumentHistory<number>(1)
  history.commit(2)
  history.undo()
  history.reset(9)
  assert.equal(history.present, 9)
  assert.equal(history.state().canUndo, false)
  assert.equal(history.state().canRedo, false)
})
