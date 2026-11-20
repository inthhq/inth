/**
 * `@inth/svelte/kit` — the SvelteKit layer.
 *
 * `InthProvider` is the root for `+layout.svelte`. Everything else is
 * server-only: keep it to `hooks.server.ts`, `+*.server.ts` and
 * `+server.ts`. A browser build resolves this path to `./browser`, which
 * has only `InthProvider`, so no server module reaches the client. The
 * modes here are plain data; `InthProvider` turns them into a transport in
 * the browser.
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
 * <script lang="ts">
 *   import { InthProvider } from '@inth/svelte/kit';
 *   let { children, data } = $props();
 * </script>
 *
 * <InthProvider state={data.consent}>
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
export type { InthProviderState } from '../types';

export type {
	ConsentMode,
	HostedMode,
	ManifestMode,
	ManifestModeOptions,
	TestingMode,
} from '@inth/sdk/modes';
export { hosted, manifest } from '@inth/sdk/modes';
export { default as InthProvider } from './inth-provider.svelte';
