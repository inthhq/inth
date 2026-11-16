---
packages:
  '@c15t/core': patch
---

### Forward one normalized site origin from the consent route

With `trustForwardedHeaders` on, the consent route's proxy now sends the
backend the site origin the route resolves relative backend URLs against.
It reads the RFC 7239 `Forwarded` header, and takes the first value of a
comma-separated `x-forwarded-host` or `x-forwarded-proto`. Before, it passed
those two headers on as raw strings and ignored `Forwarded`. Without
`trustForwardedHeaders`, nothing changes.
