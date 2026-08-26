// Replaces `virtual:open-slide/config`. Upstream fills this from
// `open-slide.config.ts` plus CLI flags; in the host the values that remain
// meaningful are fixed. `base`/`port` describe a dev server that does not
// exist here and are omitted.

import { en } from '../locale/en'

const config = {
  slidesDir: 'slides',
  // `locale` is the resolved Locale table, not its id — upstream's config
  // loader inlines the object and the store reads `config.locale` directly.
  locale: en,
  version: '1.19.1',
  build: {
    showSlideBrowser: true,
    showSlideUi: true,
    // A browser download is a build error in this host (spec §25); artifacts
    // leave through Files instead, so the HTML download entry point is off.
    allowHtmlDownload: false,
  },
}

export default config
