---
packages:
  '@c15t/react': patch
---

### The early dialog downloads once

The deferred root's early dialog and the aggregate `ConsentDialog`'s hover
and idle warming now load the dialog through one `import()`. Turbopack builds
a chunk group per call site, so a hover on Customize followed by the tap
downloaded the panel twice. On the consent gate's React page that was about
22 KB of the 47 KB the tap fetched; Customize there goes from 515 ms to
386 ms.
