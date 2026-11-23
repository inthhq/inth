/**
 * `@inth/svelte/dialog-panel`: the consent dialog without the deferred
 * wrapper.
 *
 * `ConsentDialog` from the package root imports this component the first
 * time the dialog opens, which costs a round trip after whatever mounted
 * it. A surface that is itself loaded on demand imports it from here
 * instead, so the dialog arrives in the same download as the surface. It
 * renders the dialog alone: `ConsentDialog` adds the trigger and the
 * confirmations it hosts.
 *
 * `ConsentRuntimeProvider` is `InthProvider` for a runtime the surface
 * is handed, without the code `InthProvider` carries to create one.
 *
 * @packageDocumentation
 */

export { default as ConsentDialogPanel } from './components/dialog/dialog.svelte';
export type { ConsentDialogProps } from './components/dialog/consent-dialog-props.model';
export { default as ConsentRuntimeProvider } from './components/runtime-provider.svelte';
export { default as OptOutConfirmationPanel } from './components/confirmation/opt-out-confirmation.svelte';
