---
packages:
  'c15t': minor
  '@c15t/core': minor
  '@c15t/svelte': minor
  '@c15t/ui': patch
---

### SvelteKit: load the consent engine after the page

`ConsentRoot` no longer puts the consent engine in the page's first-load
JavaScript for a visitor the server render asks to choose. The server still
renders the banner and its styles into the first HTML, so the banner shows at
first paint as before.

In the browser the page hydrates from the consent state the server rendered
with, which the server render leaves after the page's content.
`getConsentKernel()`, `getSnapshot()` and the other getters return it at once.
The engine loads after the page's `fetchpriority="high"` images, at the first
pointer press, key press or scroll outside the banner, when page code needs it,
or after 10 seconds. The page no longer preloads the script loader for such a
visitor. On the CookieBench SvelteKit article page the layout's first-load
JavaScript went from 113 KB to 70 KB, compressed.

An Accept all or Reject all tapped before the engine loads takes effect in the
tap's own task: the consent state changes and the plain `scripts` entries the
choice allows start. c15t then stores the record, queues the save and calls
`onChoiceRecorded` and `onPermissionsChanged`. The engine loads next, starts
from the record and sends the save without recording it again. Customize opens
the dialog without the engine, and a save from the dialog takes the same path.
Once the engine has loaded, the code that stores and sends a choice loads in
idle time, so a later tap downloads only the scripts it allows.

Returning visitors, notice prompts, privacy signals, IAB, experiments,
`consentSource`, `gpp`, `networkBlocker`, `enabled: false`,
`persistence: false` and `scripts` entries that may run at once load the
engine as the page starts, and the server render preloads it. On a route with
`ssr = false`, `ConsentRoot` renders its children once the engine has loaded.
`ConsentProvider` is unchanged.

The stock surfaces no longer carry their stylesheets in the browser bundle.
Each names only its own part of the first-paint sheet, as the React surfaces
do: the banner `c15t-tokens`, `c15t-button` and `c15t-banner`, the trigger
`c15t-tokens` and `c15t-trigger`, `ConsentGate` its button and placeholder
rules. `c15tHandle` writes only those into the HTML, so a first visit's page no
longer carries the trigger's, `ConsentGate`'s or dialog-only rules. On a page
that lacks them the surfaces load them and stay hidden until they arrive. They
are hidden with `opacity`, so a blocking banner and the dialog take keyboard
focus as they mount, before their rules land, and keep it once they do.

A tap on the server-rendered banner before the page hydrates is no longer
lost. The banner puts a small inline script ahead of its markup that holds an
Accept all, Reject all, Customize or acknowledge tap and hides the banner;
the banner records it once it hydrates, as the React and Vue banners do.
`c15tHandle` gives the script the page's CSP nonce.

The banner's first-load code no longer carries the English translation bundle
or the focus-trap and scroll-lock code. The server completes the snapshot's
copy with the English defaults for any key a translation leaves out, and a
blocking banner loads its focus trap when it mounts. With Vite 8,
`consentManifest()` puts the small modules `ConsentRoot`'s first load shares
with the consent engine into one chunk, so the page fetches about a dozen
fewer files. That chunk now holds only what the first load runs: vendor
resolution, experiment assignment and storage, record evaluation and the
cookie writer load with the engine. The provider's `isVendorAllowed`,
`getDisplayedVendors` and `presentation` read through small `@c15t/core`
modules split out for this, and answer as before. On the CookieBench SvelteKit
page this takes another 5.4 KB of compressed JavaScript off the first load.

`@c15t/core/runtime/save-preload` is a new internal entry that loads the
save's write and outbox code ahead of the visitor's choice.
