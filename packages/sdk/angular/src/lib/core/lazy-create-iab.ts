/**
 * The package's lazy IAB factory.
 *
 * `provideInth()` runs in every app, IAB or not, so it cannot import
 * `@inth/sdk/iab` statically: that would put the CMP API and the `__tcfapi`
 * bridge in the main bundle of apps that never turn IAB on. The runtime
 * calls `createIAB` synchronously, so the deferral happens here:
 * {@link lazyCreateIAB} hands back a handle at once and forwards to the
 * real one once the dynamic import resolves.
 *
 * Surfaces that render against the handle wait for {@link whenIABReady}
 * first, so they never read methods that have not arrived.
 *
 * @packageDocumentation
 * @internal
 */

import type { GPPModuleLoader } from '@inth/sdk/runtime';
import { createLazyIABFactory } from '@inth/sdk/surface-state';

import type { ProviderIABOptions } from './inth-options';

const factory = createLazyIABFactory(() => import('@inth/sdk/iab'));

/** The `createIAB` the provider hands the runtime. @internal */
export const lazyCreateIAB = factory.create;

/**
 * Resolves once every pending `@inth/sdk/iab` load has settled.
 *
 * @returns A promise that settles when the IAB module has loaded.
 */
export const whenIABReady = factory.whenReady;

/**
 * Loads `@inth/sdk/iab/gpp`. One function for every call, so passing it to the
 * runtime's `update()` never reads as a changed option.
 *
 * @internal
 */
export const loadGPP: GPPModuleLoader = () => import('@inth/sdk/iab/gpp');

/**
 * Whether IAB is configured.
 *
 * Mirrors the runtime's own check, so the provider only wires the loader
 * for apps that will mount a CMP.
 *
 * @returns `true` when the runtime would mount the TCF addon.
 * @internal
 */
export const isIABConfigured = function isIABConfigured(
	iab: ProviderIABOptions | undefined
): boolean {
	return Boolean(iab) && (iab as { enabled?: boolean }).enabled !== false;
};
