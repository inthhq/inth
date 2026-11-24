---
packages:
  "group:sdk": patch
---

### Astro: a tap after a failed consent chunk records the choice in Chromium

- Chromium keeps a failed module download for the life of the page, so a second tap on the banner after the consent engine or prompt failed to load failed again without a request, and the choice was never recorded. When the tap's retry fails again and the chunk now answers, the page reloads once and records the tapped Accept or Reject on the reloaded page. A chunk that still fails, or a browser that is offline, does not reload the page, and the page reloads at most once in 30 seconds for this.
- On a prerendered page, which has no early-tap script, a tap on the banner after the engine or prompt failed to load now retries the load. Before, the tap did nothing.

### React, Vue, Svelte and Angular: the dialog returns focus to an opener inside a shadow root

- When a button inside an open shadow root (a web component) opened the preferences dialog, closing it sent focus to a fallback on the page, because the dialog recorded the shadow host as its opener. It now records the focused button itself and returns focus to it.
