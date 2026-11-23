---
packages:
  "group:sdk": patch
---

### React and Next.js: taps on the banner before the page hydrates

On a server-rendered page, such as a Next.js page, the banner shows before React makes its buttons work. A tap in that gap was lost before: the visitor tapped Reject or Accept and nothing happened. Now the banner's inline script keeps the tap, and the banner applies it as soon as it hydrates:

- **Reject** and **Accept** save the choice the same way as a tap after hydration, at the time of the tap. The banner hides at once.
- **Customize** opens the options inside the banner, as it does after hydration. No dialog opens.
- **OK** on a US notice closes the notice.

With deferred loading in Next.js, a tap on the banner loads the consent engine, which then applies the tap.
