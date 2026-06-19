import { useState } from 'react'

interface Quote {
  text: string
  who: string
}

const QUOTES: Quote[] = [
  { text: 'Simplicity is the soul of efficiency.', who: 'Austin Freeman' },
  { text: 'Make it work, make it right, make it fast.', who: 'Kent Beck' },
  { text: 'The best way to predict the future is to invent it.', who: 'Alan Kay' },
  { text: 'Programs must be written for people to read.', who: 'Harold Abelson' },
  { text: 'Talk is cheap. Show me the code.', who: 'Linus Torvalds' },
  { text: 'Premature optimization is the root of all evil.', who: 'Donald Knuth' },
  { text: 'Any sufficiently advanced technology is indistinguishable from magic.', who: 'Arthur C. Clarke' },
]

function nextIndex(current: number, length: number): number {
  if (length <= 1) return current
  let candidate = current
  while (candidate === current) {
    candidate = Math.floor(Math.random() * length)
  }
  return candidate
}

export function App() {
  const [index, setIndex] = useState(0)
  const quote = QUOTES[index]

  return (
    <main className="quote">
      <figure className="quote-card">
        <blockquote>{quote.text}</blockquote>
        <figcaption>— {quote.who}</figcaption>
      </figure>
      <button
        type="button"
        className="quote-shuffle"
        onClick={() => setIndex((current) => nextIndex(current, QUOTES.length))}
      >
        Shuffle
      </button>
      <p className="quote-count">{index + 1} / {QUOTES.length}</p>
    </main>
  )
}
