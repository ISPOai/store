import { useMemo, useState } from 'react'

const CHANNELS = [
  { key: 'r', label: 'Red' },
  { key: 'g', label: 'Green' },
  { key: 'b', label: 'Blue' },
] as const

function toHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')
}

export function App() {
  const [r, setR] = useState(109)
  const [g, setG] = useState(140)
  const [b, setB] = useState(255)

  const setters = { r: setR, g: setG, b: setB }
  const values = { r, g, b }

  const hex = useMemo(() => `#${toHex(r)}${toHex(g)}${toHex(b)}`, [r, g, b])
  const rgb = `rgb(${r}, ${g}, ${b})`

  return (
    <main className="pick">
      <header className="pick-head">
        <h1>Color Picker</h1>
        <p>Mix an RGB color and copy the values.</p>
      </header>

      <section className="pick-card">
        <div className="pick-swatch" style={{ background: rgb }} />

        {CHANNELS.map((channel) => (
          <label key={channel.key} className="pick-field">
            <span>
              {channel.label} — {values[channel.key]}
            </span>
            <input
              type="range"
              min={0}
              max={255}
              step={1}
              value={values[channel.key]}
              onChange={(event) => setters[channel.key](event.target.valueAsNumber)}
            />
          </label>
        ))}
      </section>

      <section className="pick-out">
        <Row label="HEX" value={hex} />
        <Row label="RGB" value={rgb} />
      </section>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="pick-row">
      <span className="pick-row-label">{label}</span>
      <span className="pick-row-value">{value}</span>
    </div>
  )
}
