import type { DevToolsOptions } from '@inth/sdk/devtools';

/** Props for the kernel-bound Svelte DevTools adapter. */
export type ConsentDevToolsProps = Omit<
	DevToolsOptions,
	'container' | 'kernel'
>;

/** Backward-compatible props name for the ConsentDevTools component. */
export type InthDevToolsProps = ConsentDevToolsProps;

/** Compatible props name for the DevTools component alias. */
export type DevToolsProps = ConsentDevToolsProps;
