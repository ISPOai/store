import { useEffect, useState } from 'react'

const PRESETS = [25, 15, 5]

function format(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function App() {
  const [presetMinutes, setPresetMinutes] = useState(25)
  const [remaining, setRemaining] = useState(25 * 60)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          setRunning(false)
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  function selectPreset(minutes: number) {
    setPresetMinutes(minutes)
    setRunning(false)
    setRemaining(minutes * 60)
  }

  function reset() {
    setRunning(false)
    setRemaining(presetMinutes * 60)
  }

  return (
    <main className="pomo">
      <header className="pomo-head">
        <h1>Pomodoro Timer</h1>
        <p>Focus in tidy intervals.</p>
      </header>

      <section className="pomo-card">
        <div className="pomo-clock">{format(remaining)}</div>

        <div className="pomo-controls">
          {running ? (
            <button type="button" className="pomo-btn is-primary" onClick={() => setRunning(false)}>
              Pause
            </button>
          ) : (
            <button
              type="button"
              className="pomo-btn is-primary"
              onClick={() => setRunning(true)}
              disabled={remaining === 0}
            >
              Start
            </button>
          )}
          <button type="button" className="pomo-btn" onClick={reset}>
            Reset
          </button>
        </div>

        <div className="pomo-presets">
          {PRESETS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={minutes === presetMinutes ? 'pomo-preset is-active' : 'pomo-preset'}
              onClick={() => selectPreset(minutes)}
            >
              {minutes} min
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}
