---
packages:
  '@c15t/core': patch
  '@c15t/react': patch
---

### Client-rendered React pages show the banner before the consent engine loads

In a browser build, `ConsentProvider` from `@c15t/react` (and `c15t/react`)
renders the page at once and loads the consent engine after the page's
priority images, or on the first tap, key press or scroll, when the mode is
`hosted()`. The stock banner renders from the `/init` answer as soon as it
arrives. With `consentManifest()` the inline prefetch in the HTML already
sent that request; without one, the provider sends it as it first renders,
and the engine later takes the same answer. A visitor with a stored choice
gets the engine at once.

The banner renders under the browser's Global Privacy Control signal, as
the engine reads it, and reads only an inline prefetch sent under the same
signal.

A tap on the banner before the engine loads hides it at once. For a visitor
with no stored choice, Accept and Reject take effect in the tap's own task:
the plain scripts the choice allows start, and the hooks return the choice. A
chunk of a few KB, requested right after, stores the choice, queues the save
and calls the callbacks; the engine loads afterwards, starts from that choice
and sends the save. Customize opens the
dialog from its own chunk, and the engine loads once the dialog shows.

On CookieBench's React page with the mobile profile, this takes c15t's
first-load JavaScript from 69 KB to 41 KB after Brotli and stops the dialog,
script-loader and engine chunks from downloading while the hero image does.

Other setups load the engine with the page, as before: `prefetch`, an
`experiment`, `consentSource`, `networkBlocker`, `scripts` or `vendors` in the
options, `enabled: false`, a borrowed `runtime`, or a mode other than
`hosted()` (or a `hosted()` mode with its own init URL, headers, `fetch` or
initial data). Server builds resolve `ConsentProvider` to the
provider itself, so server rendering is unchanged. `@c15t/react/provider`
always loads the engine with the page.

The dialog's idle preload now also waits for the page's priority images.
`consentManifest()` puts the c15t modules a page loads up front into one
chunk on Rolldown 1.2 and later, unless the app sets its own chunking.
