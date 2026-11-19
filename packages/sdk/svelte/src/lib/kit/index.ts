/**
 * `@inth/svelte/kit` — the SvelteKit server layer.
 *
 * Server-only: keep it to `hooks.server.ts`, `+*.server.ts` and
 * `+server.ts`. The modes here are plain data; `<ConsentRoot>` from
 * `@inth/svelte` turns them into a transport in the browser.
 *
 * ```ts
 * // src/hooks.server.ts
 * import { inthHandle } from '@inth/svelte/kit';
 *
 * export const handle = inthHandle();
 *
 * // src/routes/+layout.server.ts
 * export { loadConsent as load } from '@inth/svelte/kit';
 * ```
 *
 * ```svelte
 * <!-- src/routes/+layout.svelte -->
 * <ConsentRoot state={data.consent}>
 * ```
 *
 * Prerendered pages also need the consent route, and its prefix on the
 * handle:
 *
 * ```ts
 * // src/routes/api/inth/[...path]/+server.ts
 * export const { GET } = createConsentRoute();
 *
 * // src/hooks.server.ts
 * export const handle = inthHandle({ routePrefix: '/api/inth' });
 * ```
 */
export type { InthHandle, InthHandleOptions } from './handle';
export { inthHandle } from './handle';
export type { LoadConsentOptions } from './load-consent';
export { loadConsent } from './load-consent';
export type {
	ConsentProxyOptions,
	ConsentRouteHandlersFor,
	ConsentRouteOptions,
} from './routes';
export { createConsentRoute } from './routes';
export type {
	InthLocals,
	ConsentRequestInputs,
	ConsentRequestOptions,
	ConsentState,
} from './types';
export type { ConsentRootState } from '../types';

export type {
	ConsentMode,
	HostedMode,
	ManifestMode,
	ManifestModeOptions,
	TestingMode,
} from '@inth/sdk/modes';
export { hosted, manifest } from '@inth/sdk/modes';
