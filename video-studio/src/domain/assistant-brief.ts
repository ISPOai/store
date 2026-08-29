// The bounded assistant context this app publishes: what is open, what is
// selected, and where the current export stands. The brief is advisory
// observation for the host assistant surface — it never carries media bytes,
// entity ids, controlled reference URLs, filesystem paths, or credentials,
// and every string is clamped before it leaves the app.
export interface AssistantBriefInput {
  readonly screen: 'projects' | 'editor'
  readonly projectTitle: string | null
  readonly stage: { readonly width: number; readonly height: number; readonly fps: number } | null
  readonly clipCount: number
  readonly selectionLabel: string | null
  readonly saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  readonly exportStatus: string
}

export interface AssistantBrief {
  readonly title: string
  readonly summary: string
  readonly breadcrumbs: string[]
  readonly status: string
  readonly selection?: string
}

const MAX_FIELD_CHARS = 200

/**
 * Strips control characters, masks URL-shaped runs, collapses whitespace,
 * and clamps to the field budget. Applied to every free-text value that
 * reaches the assistant surface.
 */
export function safeBriefText(value: string, maxLength: number = MAX_FIELD_CHARS): string {
  const withoutUrls = value.replace(/[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S*/g, '[reference]')
  const collapsed = withoutUrls.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  return collapsed.slice(0, maxLength)
}

export function buildAssistantBrief(input: AssistantBriefInput): AssistantBrief {
  const breadcrumbs = ['Video Studio']
  let summary: string
  if (input.screen === 'editor' && input.projectTitle !== null) {
    breadcrumbs.push(safeBriefText(input.projectTitle, 80))
    const stage = input.stage
    const geometry = stage === null ? '' : ` · ${stage.width}\u00d7${stage.height} @ ${stage.fps}fps`
    summary = safeBriefText(
      `Editing ${input.projectTitle}${geometry} · ${input.clipCount} clip${input.clipCount === 1 ? '' : 's'}`,
    )
  } else {
    summary = 'Browsing saved compositions'
  }
  const status = `save ${input.saveStatus} · ${safeBriefText(input.exportStatus, 80)}`
  if (input.selectionLabel !== null && input.selectionLabel !== '') {
    return {
      title: 'Video Studio',
      summary,
      breadcrumbs,
      status,
      selection: safeBriefText(input.selectionLabel, 80),
    }
  }
  return { title: 'Video Studio', summary, breadcrumbs, status }
}
