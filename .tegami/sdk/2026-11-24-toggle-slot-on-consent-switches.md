---
packages:
  "group:sdk": patch
---

### The `toggle` theme slot styles the consent UI's switches again

- `theme.slots.toggle` (`components.switch.root`) applies to every switch in the prompt, the dialog and the vendor tables, in React, Vue, Svelte, Angular, Astro and the script-tag build. Since the consent UI was replaced it had only reached `ConsentWidget` and the IAB surfaces.
- A slot with `noStyle: true` drops the stock switch, as it does for other parts.
- Script tag: each switch carries `part="toggle"`, so `::part(toggle)` reaches it.
