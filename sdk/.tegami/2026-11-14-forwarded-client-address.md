---
packages:
  "@c15t/backend": patch
  "@c15t/core": patch
  "@c15t/schema": patch
---

### Read the client address from an RFC 7239 Forwarded header

Behind a proxy that sends `Forwarded`, the client IP was the whole first
element, such as `for=192.0.2.60;proto=https`. It is now the `for=` address:
quotes, a bracketed IPv6 address and a port are handled, and `unknown` or an
obfuscated identifier gives no address. The address the backend stores on a
consent record and the `X-Forwarded-For` a consent route sends upstream both
use it.
