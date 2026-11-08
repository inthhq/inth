---
packages:
  'c15t': minor
  '@c15t/svelte': minor
---

### Svelte: import the preference dialog directly

`@c15t/svelte/dialog-panel` (`c15t/svelte/dialog-panel`) exports
`ConsentDialogPanel`, the dialog `ConsentDialog` loads the first time it
opens. A surface that is itself loaded on demand can import it to get the
dialog in the same download instead of one round trip later. It takes
`ConsentDialog`'s props.

The same entry exports `ConsentRuntimeProvider`: `ConsentProvider` for a
runtime the caller created and owns, passed as `runtime`. It renders the same
context and takes the same options, but carries none of the code
`ConsentProvider` uses to create a runtime, so a surface that always borrows
one does not download the consent engine with it.
