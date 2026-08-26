// Replaces `virtual:open-slide/config`. Upstream fills this from
// `open-slide.config.ts` plus CLI flags; in the host the values that remain
// meaningful are fixed. `base`/`port` describe a dev server that does not
// exist here and are omitted.

const config = {
  slidesDir: 'slides',
  locale: 'en' as const,
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
