---
packages:
  "group:sdk": patch
---

### The consent prompt stays inside a short viewport

- An expanded Card, Banner or Drawer is never taller than the viewport. On a phone held sideways, or a desktop page at 200% zoom, the title and policy links used to sit above the top of the screen with no way to scroll to them.
- The choices shrink first. If the head, the choices and the footer still do not fit, the card scrolls.
- `--consent-expand-min-height` (default `6rem`) sets the least height the choices keep before the card scrolls.
