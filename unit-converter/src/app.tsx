import { useMemo, useState } from 'react'

// Conversion factors expressed in meters per unit.
const UNITS: Record<string, { label: string; meters: number }> = {
  meters: { label: 'Meters', meters: 1 },
  kilometers: { label: 'Kilometers', meters: 1000 },
  feet: { label: 'Feet', meters: 0.3048 },
  inches: { label: 'Inches', meters: 0.0254 },
  miles: { label: 'Miles', meters: 1609.344 },
}

const UNIT_KEYS = Object.keys(UNITS)

function format(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

export function App() {
  const [amount, setAmount] = useState(1)
  const [from, setFrom] = useState('meters')
  const [to, setTo] = useState('feet')

  const result = useMemo(() => {
    const safe = Number.isFinite(amount) ? amount : 0
    const inMeters = safe * UNITS[from].meters
    return inMeters / UNITS[to].meters
  }, [amount, from, to])

  return (
    <main className="conv">
      <header className="conv-head">
        <h1>Unit Converter</h1>
        <p>Convert a length between common units.</p>
      </header>

      <section className="conv-card">
        <label className="conv-field">
          <span>Value</span>
          <input
            type="number"
            step="any"
            value={Number.isFinite(amount) ? amount : ''}
            onChange={(event) => setAmount(event.target.valueAsNumber)}
          />
        </label>

        <div className="conv-pair">
          <label className="conv-field">
            <span>From</span>
            <select value={from} onChange={(event) => setFrom(event.target.value)}>
              {UNIT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {UNITS[key].label}
                </option>
              ))}
            </select>
          </label>

          <label className="conv-field">
            <span>To</span>
            <select value={to} onChange={(event) => setTo(event.target.value)}>
              {UNIT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {UNITS[key].label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="conv-out">
        <span className="conv-out-value">{format(result)}</span>
        <span className="conv-out-label">{UNITS[to].label.toLowerCase()}</span>
      </section>
    </main>
  )
}
