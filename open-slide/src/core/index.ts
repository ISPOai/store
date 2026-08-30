// `@open-slide/core` — the surface a slide module imports.
//
// Upstream publishes this from its own package; here the same modules are
// vendored into src/app, so this file re-exports them under the name slides
// already use. Mapped by tsconfig `paths`, so slide sources stay byte-identical
// to upstream's.
export type { ImagePlaceholderProps } from '../app/components/image-placeholder'
export { ImagePlaceholder } from '../app/components/image-placeholder'
export type { MorphElementProps } from '../app/components/morph-element'
export { MorphElement } from '../app/components/morph-element'
export type { DesignFonts, DesignPalette, DesignSystem, DesignTypeScale } from '../app/lib/design'
export { cssVarsToString, defaultDesign, designToCssVars } from '../app/lib/design'
export { useSlidePageNumber } from '../app/lib/page-context'
export type { Page, SlideMeta, SlideModule } from '../app/lib/sdk'
export { CANVAS_HEIGHT, CANVAS_WIDTH } from '../app/lib/sdk'
export type { StepProps, StepsProps } from '../app/lib/step-context'
export { Step, Steps, useIsActivePage } from '../app/lib/step-context'
export type { MorphTransition, SlideTransition, TransitionPhase } from '../app/lib/transition'
export type { Locale, Plural } from '../locale/types'
