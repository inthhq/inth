---
packages:
  "group:sdk": patch
---

### Astro: a consent chunk that fails again never reloads the page

- When the consent engine or prompt chunk fails to download and the visitor's retry tap fails again, the page stays as it is. Chromium and WebKit keep a failed chunk for the life of the page, so the retry cannot succeed there: the banner shows again, the choice is not recorded, and consent gates stay closed. The next page load downloads the chunk again. The page does not reload itself to recover, so a visitor keeps anything they typed into the host page.
- [Troubleshooting](/docs/frameworks/astro/troubleshooting) describes the limitation, which React, Vue, Svelte, Angular and the script tag share.
