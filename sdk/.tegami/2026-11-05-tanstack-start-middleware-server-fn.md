---
packages:
  'c15t': patch
  '@c15t/tanstack-start': patch
---

### Run consentRequestMiddleware() on a server function again

`createServerFn().middleware([consentRequestMiddleware()])` failed the page's
server render with "Cannot destructure property 'headers' of
'result.response'". On a server function the middleware now normalizes the
location, language and privacy headers, sets `context.consent`, and returns
the function's result unchanged. It sets no `c15t-sid` cookie there; register
it in `src/start.ts` for that.
