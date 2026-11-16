---
packages:
  '@c15t/iab': patch
---

### Ignore a custom vendor that reuses a registered vendor's id

A custom vendor whose id matches a vendor in the Global Vendor List used to
share that vendor's row and choices, and the registered vendor lost its place
in the TC string. The custom vendor is now ignored and the console names it, so
the registered vendor keeps its row and its TCF signals. Give each custom vendor
an id that no registered vendor uses, such as a string.
