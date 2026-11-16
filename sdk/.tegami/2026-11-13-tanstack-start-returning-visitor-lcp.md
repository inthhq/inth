---
packages:
  '@c15t/tanstack-start': patch
---

### Keep the consent engine off a returning visitor's LCP

For a returning visitor who already chose and sees no banner, `ConsentRoot`
no longer loads the consent engine while the page's largest image loads. It
inserts the plain scripts their choice allows itself as the page hydrates, and
loads the engine after the `fetchpriority="high"` images, at the first input
or scroll, or after 10 seconds.

On CookieBench's throttled mobile profile this cut the returning visitor's LCP
cost over a page without c15t from about 880 ms to about 370 ms, and the gated
scripts ran about 1.3 s sooner.

The engine still loads at once when the browser holds a newer choice than the
server read (a newer denial, a Global Privacy Control signal or an expired
decision), or when a script that may run needs a vendor or IAB fields. A
script with callbacks needs it too, unless the server started that script
from the HTML: then only `onLoad`, `onError`, `onDispose` and
`persistAfterDispose` do, because only the script loader hears the element's
`load` and `error` events and keeps or removes it.
