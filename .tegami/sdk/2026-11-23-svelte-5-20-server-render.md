---
packages:
  "group:sdk": patch
---

`ConsentBanner` renders on the server again under Svelte 5.20, the oldest version `@inth/svelte` supports. The banner bound a prop on a child component, and Svelte 5.20's server output for a component binding calls a function it never declares (`$$render_inner is not defined`), so the page failed with a 500. The banner now takes the element through a new `onref` callback on `ConsentButton` instead of `bind:ref`.
