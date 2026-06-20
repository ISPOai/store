import { useState } from 'react'

const SIDES = [4, 6, 8, 12, 20]

function roll(count: number, sides: number): number[] {
  return Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1)
}

export function App() {
  const [count, setCount] = useState(2)
  const [sides, setSides] = useState(6)
  const [results, setResults] = useState<number[]>([])

  const total = results.reduce((sum, value) => sum + value, 0)

  function doRoll() {
    setResults(roll(count, sides))
  }

  return (
    <main className="dice">
      <header className="dice-head">
        <h1>Dice Roller</h1>
        <p>Roll a handful of dice.</p>
      </header>

      <section className="dice-card">
        <div className="dice-field">
          <span>Count</span>
          <div className="dice-stepper">
            <button type="button" onClick={() => setCount((n) => Math.max(1, n - 1))}>
              −
            </button>
            <output>{count}</output>
            <button type="button" onClick={() => setCount((n) => Math.min(6, n + 1))}>
              +
            </button>
          </div>
        </div>

        <div className="dice-field">
          <span>Die</span>
          <div className="dice-sides">
            {SIDES.map((side) => (
              <button
                key={side}
                type="button"
                className={side === sides ? 'dice-side is-active' : 'dice-side'}
                onClick={() => setSides(side)}
              >
                d{side}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="dice-roll" onClick={doRoll}>
          Roll
        </button>
      </section>

      {results.length > 0 && (
        <section className="dice-out">
          <div className="dice-faces">
            {results.map((value, index) => (
              <span key={index} className="dice-face">
                {value}
              </span>
            ))}
          </div>
          <div className="dice-total">
            <span className="dice-total-label">Total</span>
            <span className="dice-total-value">{total}</span>
          </div>
        </section>
      )}
    </main>
  )
}
