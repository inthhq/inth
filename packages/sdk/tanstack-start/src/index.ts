/**
 * `@inth/tanstack-start` client entry.
 *
 * Pattern:
 *   // src/routes/__root.tsx
 *   import { createRootRoute, Outlet } from '@tanstack/react-router';
 *   import { createServerFn } from '@tanstack/react-start';
 *   import { InthProvider } from '@inth/tanstack-start';
 *   import {
 *     consentLoaderOptions,
 *     createConsentStateHandler,
 *   } from '@inth/tanstack-start/server';
 *
 *   // Declared in your module: the Start compiler splits server code at
 *   // this `createServerFn().handler()` call site.
 *   const getConsentState = createServerFn({ method: 'GET' }).handler(
 *     createConsentStateHandler()
 *   );
 *
 *   export const Route = createRootRoute({
 *     ...consentLoaderOptions,
 *     loader: async () => ({ consent: await getConsentState() }),
 *     component: RootComponent,
 *   });
 *
 *   function RootComponent() {
 *     const { consent } = Route.useLoaderData();
 *     return (
 *       <InthProvider state={consent}>
 *         <Outlet />
 *       </InthProvider>
 *     );
 *   }
 *
 *   // any component
 *   import { useConsent } from '@inth/tanstack-start';
 *   const allowed = useConsent('marketing');
 *
 * The backend URL comes from `consentManifest()` in `vite.config.ts`, and
 * the state carries it, the mode and the route prefix to `InthProvider`.
 * The browser gets init from `${projectUrl}/v1/consent/init` and saves to
 * `${projectUrl}/v1/consent/records`. Apps that mount `createConsentRoute()` at
 * `/api/inth/$` pass `routePrefix: '/api/inth'` to
 * `createConsentStateHandler()` to resolve init on their own origin, the
 * same option Next.js `defineConsentConfig` takes. With
 * `createConsentRoute({ proxy: true })`, also pass `proxy: true` there;
 * init and saves then both go through the route.
 *
 * `manifest()` and `hosted()` here are plain data for
 * `createConsentStateHandler({ mode })`. `InthProvider` loads the code for a
 * mode only when the browser runs it.
 *
 * Server helpers return serializable data and avoid module-level runtime
 * caches, so concurrent requests never share a kernel.
 */

export { buildPrefetchScript, type PrefetchOptions } from '@inth/sdk/engine';
export type {
	ConsentMode,
	ConsentModeType,
	HostedMode,
	ManifestMode,
	ManifestModeInputs,
	ManifestModeOptions,
	TestingMode,
} from '@inth/sdk/modes';
// The data `manifest()` replaces the transport implementation of the same
// name that the re-export of `@inth/react` below would otherwise provide.
export { hosted, manifest } from '@inth/sdk/modes';
// oxlint-disable-next-line oxc/no-barrel-file -- Preserve declaration order, interface shape, and public compatibility.
export * from '@inth/react';
// Their code loads with the deferred root's engine; see `./root`.
export {
	DeferredConsentBanner as ConsentBanner,
	DeferredConsentDialog as ConsentDialog,
	DeferredOptOutConfirmation as OptOutConfirmation,
} from '@inth/react/deferred';
export { consentPrefetchHead } from './consent-prefetch-head';
export type { InthProviderOptions, InthProviderProps } from './inth-provider';
export { InthProvider } from './inth-provider';
export type { ConsentPrefetchHead, ConsentPrefetchHeadOptions } from './consent-prefetch-head.model';
