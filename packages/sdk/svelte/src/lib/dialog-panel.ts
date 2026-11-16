/**
 * `@c15t/svelte/dialog-panel`: the preference dialog without the deferred
 * wrapper.
 *
 * `ConsentDialog` from the package root imports this component the first
 * time the dialog opens, which costs a round trip after whatever mounted
 * it. A surface that is itself loaded on demand, such as the Astro
 * integration's dialog island, imports it from here instead, so the dialog
 * arrives in the same download as the surface. Same component and props as
 * `ConsentDialog`.
 *
 * `ConsentRuntimeProvider` is `ConsentProvider` for a runtime the surface
 * is handed, without the code `ConsentProvider` carries to create one.
 *
 * @packageDocumentation
 */

export { default as ConsentDialogPanel } from './components/panel.svelte';
export type { ConsentDialogProps } from './components/panel-props';
export { default as ConsentRuntimeProvider } from './components/runtime-provider.svelte';
