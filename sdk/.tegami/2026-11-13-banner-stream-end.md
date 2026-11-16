---
packages:
  '@c15t/ui': patch
---

### Keep a partly received banner hidden

A server-rendered banner root that carries `data-c15t-streamed` now stays
hidden until its last child, an empty `<span data-c15t-stream-end hidden>`,
has arrived. When the page's HTML reaches the browser in more than one piece,
the browser no longer paints a partial banner that then grows upward and
shifts the layout. The IAB banner already worked this way. Banners without
the attribute are unchanged.
