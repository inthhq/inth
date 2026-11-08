---
packages:
  'c15t': minor
  '@c15t/core': minor
  '@c15t/nextjs': minor
  '@c15t/react': minor
---

### Load ConsentRoot's consent engine after the page

`ConsentRoot` in `c15t/next` no longer puts the consent engine in the page's
first-load JavaScript. The server still renders the banner, its styles and
the scripts it starts into the first HTML, so the banner shows at first paint
as before.

In the browser the page under `ConsentRoot` hydrates at once. c15t's hooks
return the server's consent state until the engine loads, and their actions
run when it arrives.

An Accept or Reject tapped before the engine loads no longer waits for any
download. For a visitor with no stored choice it takes effect in the tap's own
task: the plain scripts it allows are inserted first, then c15t's hooks return
the choice. A chunk of about 9 KB compressed, requested right after, stores
the consent record, queues the save and calls `onChoiceRecorded` and
`onPermissionsChanged`. The engine then loads, starts from that choice and
sends the queued save. On the CookieBench mobile profile the choice takes
effect about 25 ms after the tap and its scripts finish about 190 ms after it,
instead of about 0.9 s and 1.3 s. A visitor with a stored choice, an active
Global Privacy Control signal or a notice-only policy waits for that chunk.
Customize hides the banner at the tap and opens the dialog from its own chunk;
the engine loads once the dialog is on screen, and a save from the dialog
takes the same path.

While `ConsentRoot`'s banner waits for the engine, its inline script keeps
pointer, mouse and touch presses on the banner's buttons from reaching the
page, as it already did for the click.

For a visitor the banner asks to choose, the engine loads after the page's
`fetchpriority="high"` images, at the first pointer press, key press or
scroll outside the banner, or after a tap on the banner. On a throttled mobile profile this
took c15t's cost to Largest Contentful Paint on the CookieBench Next.js
article page from about 400 ms to about 55 ms. Other visitors, such as a
returning visitor with consent, load the engine at once, and the server
preloads its chunks once the browser has recorded them on an earlier visit.

The engine also loads at once when a `scripts` entry or a `useScriptLoader()`
script may run for the visitor and the server did not start it. Roots with an
IAB policy, `IABProvider`, an experiment, a `networkBlocker` in config,
`options.enabled: false` or no `state` render the engine before hydrating, as
before.

`useEventDispatcher()` events sent before the engine loads are delivered once
it has. `ConsentRoot` adds an inline script after the page, empty unless it
preloads the engine; it takes `options.nonce`.
