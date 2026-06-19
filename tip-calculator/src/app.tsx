import { useState } from 'react'

const TIP_PRESETS = [10, 15, 18, 20, 25]

function money(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

export function App() {
  const [bill, setBill] = useState(48)
  const [tipPct, setTipPct] = useState(18)
  const [people, setPeople] = useState(2)

  const safeBill = Number.isFinite(bill) && bill > 0 ? bill : 0
  const tip = (safeBill * tipPct) / 100
  const total = safeBill + tip
  const perPerson = people > 0 ? total / people : total

  return (
    <main className="tip">
      <header className="tip-head">
        <h1>Tip Calculator</h1>
        <p>Split a bill and dial in the tip.</p>
      </header>

      <section className="tip-card">
        <label className="tip-field">
          <span>Bill amount</span>
          <input
            type="number"
            min={0}
            step={1}
            value={Number.isFinite(bill) ? bill : ''}
            onChange={(event) => setBill(event.target.valueAsNumber)}
          />
        </label>

        <div className="tip-field">
          <span>Tip — {tipPct}%</span>
          <div className="tip-presets">
            {TIP_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={preset === tipPct ? 'tip-preset is-active' : 'tip-preset'}
                onClick={() => setTipPct(preset)}
              >
                {preset}%
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={tipPct}
            onChange={(event) => setTipPct(event.target.valueAsNumber)}
          />
        </div>

        <label className="tip-field">
          <span>People</span>
          <div className="tip-stepper">
            <button type="button" onClick={() => setPeople((n) => Math.max(1, n - 1))}>−</button>
            <output>{people}</output>
            <button type="button" onClick={() => setPeople((n) => n + 1)}>+</button>
          </div>
        </label>
      </section>

      <section className="tip-out">
        <Row label="Tip" value={money(tip)} />
        <Row label="Total" value={money(total)} />
        <Row label="Per person" value={money(perPerson)} emphasis />
      </section>
    </main>
  )
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={emphasis ? 'tip-row is-total' : 'tip-row'}>
      <span className="tip-row-label">{label}</span>
      <span className="tip-row-value">{value}</span>
    </div>
  )
}
