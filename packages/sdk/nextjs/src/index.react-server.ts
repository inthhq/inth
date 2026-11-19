/**
 * `@inth/nextjs` under the `react-server` condition: what a Server
 * Component, route handler or `inth.config.ts` gets from `@inth/nextjs`.
 *
 * The full entry re-exports all of `@inth/react`, whose hooks import
 * client-only React APIs that webpack rejects in the server graph. Here
 * each component comes from a `'use client'` module, so the server graph
 * holds client references and never runs component code. Hooks are not
 * here: they only run in Client Components, which get the full entry.
 */
export {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	InthProvider,
} from './client-components';
export type { InthProviderProps } from './root';
export type { ConsentClientOptions, ConsentState } from './types';
export type { ConsentConfig } from './config';
export { defineConsentConfig } from './config';
export type {
	ConsentMode,
	HostedMode,
	ManifestMode,
	ManifestModeOptions,
	TestingMode,
} from '@inth/sdk/modes';
export { hosted, manifest } from '@inth/sdk/modes';
// More components, each its own client module, and the theme helpers,
// which render on the server.
export {
	ConsentDialogTrigger,
	ConsentDialogTriggerToolbar,
} from '@inth/react/components/consent-dialog-trigger';
export { ConsentGate } from '@inth/react/components/consent-gate';
export { ConsentWidget } from '@inth/react/consent-widget';
export { ConsentDraftProvider } from '@inth/react/draft';
export { ConsentTheme, defineTheme } from '@inth/react/theme';
