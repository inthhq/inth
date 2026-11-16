---
packages:
  'c15t': minor
  '@c15t/astro': minor
---

### Astro: load the consent engine after the page

The Astro integration no longer puts the consent engine in the page's
first-load JavaScript. The page script now carries the banner's click handler
and the code that records a banner choice. The server still renders the
banner, so it shows at first paint as before. On the CookieBench Astro article
page the first load dropped from 68.1 KB to 19.3 KB of compressed JavaScript
and HTML over the page without c15t.

Next to the config, the server now writes the consent state it rendered the
page from into a `data-c15t-boot` data block. Until the engine loads,
`getConsentClient()`, `getConsent()` and `subscribe()` answer from that state.
`client.runtime` is `undefined` until the new `client.ready` promise resolves,
and its type is now `ConsentRuntime | undefined`; islands that borrow the
runtime should wait for it. `getEventDispatcher()`
sends calls made before then once the engine has loaded.

For a visitor the banner asks to choose, the engine loads after the page's
`fetchpriority="high"` images, at the first pointer press, key press or scroll
outside the banner, on dialog intent, after a banner choice, or after 10
seconds. Returning visitors, notice and opt-out prompts, privacy signals, IAB,
experiments, GPP, a network blocker, a blocking banner, declared vendors, a
`consentSource` and `scripts` entries that may run at once load it as the page
script runs. The script loader now loads with the engine.

An Accept all or Reject all tapped before the engine loads takes effect in the
tap's own task: the banner hides, listeners hear the new state and the plain
`scripts` the choice allows start. A chunk requested one task later stores
the record, queues the save and calls `onChoiceRecorded` and
`onPermissionsChanged`. The scripts ask for their files before that chunk, so
on an HTTP/1.1 host, which gets six connections, they no longer wait behind
it. The engine then starts from the record and sends the save without
recording it again. Once the page's priority images have loaded, the chunk
downloads at idle. An inline script ahead of the banner records a tap that
lands before the page script runs.

With the Svelte dialog (`ui: 'svelte'`), Customize downloads only the dialog
and opens it on the state the page already has. The engine loads once the
dialog is on screen and takes it over; a save from the dialog waits for it.
On the CookieBench Astro article page, the time from the tap to the dialog
dropped from about 1,400 ms to about 940 ms, and the scripts an Accept allows
finish about 200 ms sooner. With `ui: 'react'` or `ui: 'vue'`, Customize
starts the engine and every dialog chunk at once, where the dialog used to
arrive in three dependent downloads.

A page the server shows no banner, such as a returning visitor's, no longer
inlines the banner's first-paint stylesheet. Opening the dialog there adds it.
