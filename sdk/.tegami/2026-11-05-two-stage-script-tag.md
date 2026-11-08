---
packages:
  'c15t': minor
  '@c15t/backend': minor
  '@c15t/browser': minor
  '@c15t/core': minor
  '@c15t/react': patch
---

### The script tag shows the banner before the engine loads

`c15t.js` is now a small init script. It starts `/init`, shows the stock
banner as soon as `/init` answers, and records an Accept or Reject tapped on
it in the same tap: the banner closes and the gated scripts the choice
allows start. It stores the choice with `c15t.commit.js`, which it fetches
when the visitor presses the banner. If the visitor leaves before that file
arrives, the engine records the choice on the next page. It then loads
`c15t.hosted.js`, the consent
engine and the rest of the UI, after the page's `fetchpriority="high"`
images, at the first tap, key press or scroll, or after 10 seconds. The
engine takes over the banner on screen and sends the save once.

A tap on Customize opens the stock preference dialog without the engine.
`c15t.js` fetches `c15t.dialog.js` (17 KB with Brotli) when the visitor
presses Customize, shows the dialog when it has run, and loads the engine
once the dialog is on screen. The engine takes over the open dialog,
including any switch the visitor has changed. A save from the dialog is
recorded the way an Accept is, unless it changes a vendor, which waits for
the engine. If `c15t.dialog.js` fails to load, the tap goes to the engine.

A visitor with a stored choice gets their gated scripts from `c15t.js`
without waiting for `/init`. For them `c15t.js` fetches `c15t.records.js`,
the stored-choice reader, at once; a first visit never fetches it. `c15t.js` checks the choice against the policy
the last `/init` sent, which it keeps in `localStorage` under
`c15t-init-policy` once the visitor has made a choice. A policy changed
since then applies when `/init` answers; until then, for one round trip,
the scripts the earlier policy allowed can start.

Pages keep one tag. `window.c15t` works before the engine loads: calls are
queued and run in order once it has, and `getSnapshot()`, `has()` and
`subscribe()` answer from what `c15t.js` knows so far. Until then
`c15t.init()` returns that stand-in, not the client, and `c15t.client` is
`null`; use `c15t.onInit()` for the client. If you copy `c15t.js` to your
own server, copy `c15t.hosted.js`, `c15t.commit.js`, `c15t.records.js` and
`c15t.dialog.js` next to it, or point `data-hosted-src`, `data-commit-src`,
`data-records-src` and `data-dialog-src` at them.

`c15t.js` is 28.0 KB with Brotli instead of 85 KB. `c15t.hosted.js` is the
former `c15t.js`. It loads the preference dialog from `c15t.dialog.js` the
first time it opens it, and uses its own copy when that file is missing, so
it still works as a one-file tag. Serving `c15t.dialog.js` is recommended:
without it, a Customize tap before the engine has loaded waits for the
engine.

The script-tag files no longer declare top-level variables on the page.
`c15t.hosted.js`, `c15t.local.js`, `c15t.iab.js` and `c15t.headless.js`
used to overwrite globals such as `window.e`.

`@c15t/backend` serves the engine at `/c15t.hosted.js` (`script.hostedPath`,
`script.bundles.hosted`), and the other files at `/c15t.commit.js`,
`/c15t.records.js` and `/c15t.dialog.js` (`script.commitPath`,
`script.recordsPath`, `script.dialogPath`, `script.bundles.commit`,
`script.bundles.records`, `script.bundles.dialog`). `/c15t.js` names each
with a hash of its bytes, so a cached `c15t.js` never loads a file from
another release. `/c15t.hosted.js` names the dialog file the same way.

The engine keeps offering the category of a `data-c15t-category` tag that
`c15t.js` already started. Before, on a page without `consentCategories`,
an engine that took over after `c15t.js` had started some of those tags left
their categories out of the preference dialog and out of a save.

`@c15t/core` adds `@c15t/core/surface-actions/plain-scripts` (also
`c15t/surface-actions/plain-scripts`), the plain-script start the React
deferred root already used, and lets the deferred snapshot
evaluate stored records and the GPC signal. `allConsentNames` is now a
literal list, so code that needs only the names no longer bundles the
category descriptions.
